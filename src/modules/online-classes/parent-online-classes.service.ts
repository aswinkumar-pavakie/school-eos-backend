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
import { AuditService } from '../../common/audit/audit.service';
import { ONLINE_CLASS_ERRORS } from '../../common/errors/error-codes';
import { JoinCredentials, LiveKitService } from '../livekit/livekit.service';
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

@Injectable()
export class ParentOnlineClassesService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly onlineClassRepo: OnlineClassRepository,
    private readonly liveKit: LiveKitService,
    private readonly audit: AuditService,
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
   * Mints a LiveKit join token for the parent's own device, identified in the room as
   * the STUDENT they're attending on behalf of (so the roster the faculty sees shows
   * the child's name, matching the real classroom, not the parent's). Authorization is
   * entirely this.detail()'s existing, unmodified query — a class this parent doesn't
   * own never reaches the join-state check below, same as the old join() this
   * replaces. studentId disambiguates when a parent has more than one active ward in
   * this same class's section (e.g. twins); omitted, the first match wins.
   */
  async requestCallToken(
    actor: AuthenticatedUser,
    id: string,
    studentId: string | null,
  ): Promise<JoinCredentials> {
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
        break;
      default:
        // Fail safe on any status this switch doesn't explicitly recognize as
        // joinable — never mint a token for an unexpected state.
        throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_LINK_NOT_READY);
    }
    if (!JOINABLE_STATUSES.has(detail.status)) {
      throw new ConflictException(ONLINE_CLASS_ERRORS.JOIN_LINK_NOT_READY);
    }

    const ward = await this.onlineClassRepo.findWardForOnlineClass(
      id,
      actor.personId,
      studentId,
    );
    if (!ward) {
      throw new ConflictException(ONLINE_CLASS_ERRORS.WARD_NOT_IN_CLASS);
    }

    // A parent joining while the faculty hasn't started the call yet still gets a
    // valid room/token -- LiveKit creates the room on first join, whoever that is.
    // The room name itself, though, must already exist as this class's OWN
    // deterministic name so both sides land in the same room; this repository call is
    // read+lazy-write, same ensureRoomName pattern as the faculty side, just inlined
    // here since this service has no detail-with-room-name-mutation helper of its own.
    let roomName = detail.livekitRoomName;
    if (!roomName) {
      roomName = this.liveKit.roomNameForOnlineClass(id);
      await this.onlineClassRepo.setLivekitRoom(id, roomName);
    }

    const credentials = await this.liveKit.mintJoinToken({
      roomName,
      identity: `parent:${actor.personId}:student:${ward.studentId}`,
      name: ward.studentName,
      canPublish: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    });

    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'PARENT',
      action: 'ONLINE_CLASS_CALL_TOKEN_ISSUED',
      objectType: 'online_class',
      objectId: id,
      outcome: 'SUCCESS',
    });

    return credentials;
  }
}
