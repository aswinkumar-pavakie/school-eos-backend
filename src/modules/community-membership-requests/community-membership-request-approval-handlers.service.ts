// Registers community_membership_request's subject_object_type handler with
// the generic approvals engine at startup -- same seam as
// community-proposals/community-proposal-approval-handlers.service.ts.
// Unlike that handler (a simple status flip), APPROVED here has a real side
// effect: it performs the actual add/remove against the SAME
// community_membership table Admin writes to directly -- reusing
// CommunityMembershipRepository's own create()/remove() methods (imported
// from CommunitiesModule, which exports it for exactly this) rather than
// duplicating that SQL. Both run inside the same transaction as the approval
// decision itself (the `executor` the engine hands in), so a failed add/remove
// rolls back the approval decision too -- never a decision recorded as
// APPROVED whose actual side effect silently failed.

import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { Queryable } from '../../infrastructure/postgres/postgres.service';
import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import { CommunityMembershipRepository } from '../communities/repositories/community-membership.repository';
import { CommunityMembershipRequestRepository } from './repositories/community-membership-request.repository';
import { isUniqueViolation } from './pg-error.util';

@Injectable()
export class CommunityMembershipRequestApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly requestRepo: CommunityMembershipRequestRepository,
    private readonly membershipRepo: CommunityMembershipRepository,
  ) {}

  /** Same capacity rule as CommunityMembershipRequestsService's own
   * assertUnderCapacity, duplicated rather than shared across the
   * service/handler layer boundary (matches this codebase's own convention --
   * see resolveAuthorizedCommunityId's duplication across every Community
   * service). Re-checked here, inside the SAME transaction as the decision,
   * because membership can change during the days a request sits PENDING --
   * the request-time check alone isn't authoritative. */
  private async assertUnderCapacity(
    communityId: string,
    executor: Queryable,
  ): Promise<void> {
    const { rows } = await executor.query<{
      maxMembers: number | null;
      currentCount: string;
    }>(
      `SELECT c.max_members AS "maxMembers",
              (SELECT COUNT(*) FROM community_membership cm
               WHERE cm.community_id = c.id AND cm.status IN ('ACTIVE', 'PENDING_CONSENT')) AS "currentCount"
       FROM community c
       WHERE c.id = $1`,
      [communityId],
    );
    const { maxMembers, currentCount } = rows[0];
    if (maxMembers !== null && Number(currentCount) >= maxMembers) {
      throw new ConflictException(
        `This community has reached its maximum of ${maxMembers} members.`,
      );
    }
  }

  onModuleInit(): void {
    this.registry.register('community_membership_request', {
      onApproved: async (id, executor, decidedBy) => {
        const request = await this.requestRepo.findById(id, executor);
        if (!request)
          throw new NotFoundException('Membership request not found');

        if (request.action === 'ADD') {
          await this.assertUnderCapacity(request.communityId, executor);
          try {
            await this.membershipRepo.create(
              {
                communityId: request.communityId,
                studentId: request.studentId!,
                roleInCommunity: request.roleInCommunity ?? undefined,
                addedBy: decidedBy,
              },
              executor,
            );
          } catch (err) {
            if (isUniqueViolation(err)) {
              throw new ConflictException(
                'This student is already a member of this community.',
              );
            }
            throw err;
          }
        } else {
          await this.membershipRepo.remove(request.membershipId!, executor);
        }

        await this.requestRepo.setStatus(id, 'APPROVED', executor);
      },
      onRejected: async (id, executor, _decidedBy) => {
        await this.requestRepo.setStatus(id, 'REJECTED', executor);
      },
    });
  }
}
