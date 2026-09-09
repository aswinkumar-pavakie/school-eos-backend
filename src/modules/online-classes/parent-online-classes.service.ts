// Parent (guardian) read-only access to online classes belonging to a section their
// active ward is actively enrolled in. List + detail only — no writes, ever. Kept as a
// completely separate service (and, in the controller, a separate code path) from
// OnlineClassesService so Faculty's existing behavior is provably untouched by this
// addition: nothing here is imported by, or shares mutable state with, the Faculty
// service.

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { ONLINE_CLASS_ERRORS } from '../../common/errors/error-codes';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import {
  OnlineClassRepository,
  OnlineClassStatus,
  OnlineClassView,
  ParentOnlineClassView,
  VIEW_STATUSES,
} from './repositories/online-class.repository';

// The only two statuses a parent may ever join. Not exported/shared with any
// Faculty-side status list — this is Join's own business rule, not a general lifecycle
// concept.
const JOINABLE_STATUSES: ReadonlySet<OnlineClassStatus> = new Set([
  'SCHEDULED',
  'LIVE',
]);

export interface ParentJoinResult {
  meetingUrl: string;
  status: OnlineClassStatus;
}

@Injectable()
export class ParentOnlineClassesService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly onlineClassRepo: OnlineClassRepository,
  ) {}

  async list(
    actor: AuthenticatedUser,
    view: OnlineClassView,
  ): Promise<ParentOnlineClassView[]> {
    // Fast path only — never the authorization decision for any specific class (that's
    // always the self-contained JOIN in listForParent). A parent with zero active
    // wards has nothing to find either way; this just avoids running that JOIN for
    // nothing in the common "not a parent of anyone (yet)" case.
    const wardStudentIds = await this.guardianLinkRepo.findActiveWardStudentIds(
      actor.personId,
    );
    if (wardStudentIds.length === 0) {
      return [];
    }

    return this.onlineClassRepo.listForParent(
      actor.personId,
      VIEW_STATUSES[view],
    );
  }

  async detail(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<ParentOnlineClassView> {
    const wardStudentIds = await this.guardianLinkRepo.findActiveWardStudentIds(
      actor.personId,
    );
    if (wardStudentIds.length === 0) {
      throw new NotFoundException(ONLINE_CLASS_ERRORS.NOT_FOUND);
    }

    const detail = await this.onlineClassRepo.findParentDetailById(
      id,
      actor.personId,
    );
    if (!detail) {
      // "Doesn't exist" and "exists but belongs to someone else's ward" are the same
      // 404 here too — findParentDetailById returns null for both, and this is the
      // only place that distinction could leak, so it deliberately never does.
      throw new NotFoundException(ONLINE_CLASS_ERRORS.NOT_FOUND);
    }
    return detail;
  }

  /**
   * Pure read — never creates a Meet, never touches Google, never writes to
   * online_class. Authorization is entirely this.detail()'s existing, unmodified
   * query: no separate/unscoped lookup by id exists anywhere in this method. detail()
   * itself throws the same 404 (unauthorized and nonexistent are indistinguishable)
   * before this method ever inspects status/meetingUrl — so a class this parent
   * doesn't own never even reaches the join-state check below.
   */
  async join(actor: AuthenticatedUser, id: string): Promise<ParentJoinResult> {
    const detail = await this.detail(actor, id);

    switch (detail.status) {
      case 'DRAFT':
        throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_NOT_STARTED);
      case 'COMPLETED':
        throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_ALREADY_ENDED);
      case 'CANCELLED':
        throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_CANCELLED);
      case 'SCHEDULED':
      case 'LIVE':
        if (!JOINABLE_STATUSES.has(detail.status) || !detail.meetingUrl) {
          // Defensive — JOINABLE_STATUSES already matches this case exactly; the real
          // gate here is meetingUrl, covering startClass/completeClass not currently
          // re-verifying that Google creation actually succeeded before flipping
          // status. Never falls through to returning a URL when this is true.
          throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_LINK_NOT_READY);
        }
        return { meetingUrl: detail.meetingUrl, status: detail.status };
      default:
        // Fail safe on any status this switch doesn't explicitly recognize as
        // joinable — never accidentally return a meeting URL for an unexpected state.
        throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_LINK_NOT_READY);
    }
  }
}
