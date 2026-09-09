import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateAddMembershipRequestDto } from './dto/create-add-membership-request.dto';
import { CreateRemoveMembershipRequestDto } from './dto/create-remove-membership-request.dto';
import {
  CommunityMembershipRequestRepository,
  CommunityMembershipRequestRow,
} from './repositories/community-membership-request.repository';
import { isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class CommunityMembershipRequestsService {
  constructor(
    private readonly requestRepo: CommunityMembershipRequestRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly postgres: PostgresService,
  ) {}

  /** Same resolution every other Community module in this codebase duplicates
   * rather than imports cross-module (see CommunityProposalsService's own
   * copy for the full reasoning). */
  private async resolveAuthorizedCommunityId(
    personId: string,
  ): Promise<string> {
    const { rows } = await this.postgres.query<{ scope_id: string }>(
      `SELECT scope_id FROM role_assignment
       WHERE person_id = $1 AND role_code = 'COMMUNITY' AND scope_type = 'COMMUNITY' AND status = 'ACTIVE'
       LIMIT 1`,
      [personId],
    );
    if (!rows[0]?.scope_id) {
      throw new ForbiddenException(
        'This Community account is not assigned to a specific community.',
      );
    }
    return rows[0].scope_id;
  }

  /** Proactive check so an approval never fails at decision time. Matches
   * uq_community_member exactly: that constraint is on (community_id,
   * student_id) with no exception for a REMOVED row -- once a student has
   * ever had a membership row in this community, a second INSERT always
   * conflicts, active or not (confirmed against the existing Admin-owned
   * direct-add path, which hits the identical constraint). Excluding REMOVED
   * rows here would let a request through that then fails at Principal's
   * approval instead of at submission. */
  private async assertNoExistingMembershipRow(
    communityId: string,
    studentId: string,
  ): Promise<void> {
    const { rows } = await this.postgres.query<{ id: string; status: string }>(
      `SELECT id, status FROM community_membership
       WHERE community_id = $1 AND student_id = $2
       LIMIT 1`,
      [communityId, studentId],
    );
    if (rows[0]?.status === 'REMOVED') {
      throw new ConflictException(
        'This student was previously a member and cannot be re-added to this community.',
      );
    }
    if (rows[0]) {
      throw new ConflictException(
        'This student is already a member of your community.',
      );
    }
  }

  /** A student can have at most one open ADD request per community at a
   * time -- community_membership only gains a row on approval, so
   * assertNoExistingMembershipRow alone lets the same student be
   * re-submitted while an earlier request for them is still PENDING
   * (confirmed live: two concurrent PENDING ADD rows for the same student
   * existed in this community before this check was added). REJECTED
   * requests are terminal (per this module's own design, see the migration
   * comment) so they're excluded here -- only PENDING blocks a resubmit. */
  private async assertNoPendingAddRequest(
    communityId: string,
    studentId: string,
  ): Promise<void> {
    const { rows } = await this.postgres.query<{ id: string }>(
      `SELECT id FROM community_membership_request
       WHERE community_id = $1 AND student_id = $2 AND action = 'ADD' AND status = 'PENDING'
       LIMIT 1`,
      [communityId, studentId],
    );
    if (rows[0]) {
      throw new ConflictException(
        'A request to add this student is already pending Principal review.',
      );
    }
  }

  /** community.max_members is NULL-able (no cap) -- otherwise counts every
   * seat that's currently occupied (ACTIVE or PENDING_CONSENT; REMOVED frees
   * the seat back up). Checked here for immediate feedback at submission
   * time, and checked AGAIN inside the same transaction as the approval
   * decision (community-membership-request-approval-handlers.service.ts) --
   * membership state can change during the days a request sits PENDING, so
   * the request-time check alone isn't authoritative. */
  private async assertUnderCapacity(
    communityId: string,
    executor = this.postgres,
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

  async createAddRequest(
    dto: CreateAddMembershipRequestDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityMembershipRequestRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    await this.assertNoExistingMembershipRow(communityId, dto.studentId);
    await this.assertNoPendingAddRequest(communityId, dto.studentId);
    await this.assertUnderCapacity(communityId);

    return this.unitOfWork.run(async (client) => {
      try {
        const request = await this.requestRepo.createAdd(
          {
            communityId,
            studentId: dto.studentId,
            roleInCommunity: dto.roleInCommunity,
            requestedBy: actor.personId,
          },
          client,
        );
        const approvalRequest = await this.approvalsService.createRequest(
          {
            requestType: 'COMMUNITY_MEMBERSHIP_ADD',
            subjectObjectType: 'community_membership_request',
            subjectObjectId: request.id,
            requestedBy: actor.personId,
            // studentName is a real snapshot, not invented -- requestRepo.createAdd()
            // already resolves it via its own COLUMNS join (student -> person), it just
            // wasn't being forwarded into the payload the reviewer's own detail page
            // actually renders. Without it the reviewer only ever saw a bare studentId
            // UUID, which the detail page's generic payload renderer deliberately
            // skips (an *Id-suffixed field with no human-readable value on its own).
            payload: {
              studentId: dto.studentId,
              studentName: `${request.studentFirstName ?? ''} ${request.studentLastName ?? ''}`.trim() || null,
            },
          },
          client,
        );
        await this.requestRepo.linkApprovalRequest(
          request.id,
          approvalRequest.id,
          client,
        );
        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'COMMUNITY',
            action: 'COMMUNITY_MEMBERSHIP_ADD_REQUESTED',
            objectType: 'community_membership_request',
            objectId: request.id,
            outcome: 'SUCCESS',
            afterData: {
              communityId,
              studentId: dto.studentId,
              roleInCommunity: dto.roleInCommunity,
            },
          },
          client,
        );
        return { ...request, approvalRequestId: approvalRequest.id };
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new NotFoundException('Student not found.');
        }
        throw err;
      }
    });
  }

  async createRemoveRequest(
    dto: CreateRemoveMembershipRequestDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityMembershipRequestRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);

    // Same non-disclosing pattern as every other Community object-level
    // check: wrong-community and not-found both read identically.
    const { rows } = await this.postgres.query<{
      community_id: string;
      status: string;
    }>(`SELECT community_id, status FROM community_membership WHERE id = $1`, [
      dto.membershipId,
    ]);
    const membership = rows[0];
    if (!membership || membership.community_id !== communityId) {
      throw new NotFoundException('Community membership not found');
    }
    if (membership.status === 'REMOVED') {
      throw new ConflictException('This membership has already been removed.');
    }

    return this.unitOfWork.run(async (client) => {
      const request = await this.requestRepo.createRemove(
        {
          communityId,
          membershipId: dto.membershipId,
          requestedBy: actor.personId,
        },
        client,
      );
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'COMMUNITY_MEMBERSHIP_REMOVE',
          subjectObjectType: 'community_membership_request',
          subjectObjectId: request.id,
          requestedBy: actor.personId,
          // Same fix as createAddRequest's own payload above -- requestRepo.createRemove()
          // already resolves the member's name (via community_membership -> student ->
          // person), just wasn't being forwarded to the reviewer.
          payload: {
            membershipId: dto.membershipId,
            studentName: `${request.studentFirstName ?? ''} ${request.studentLastName ?? ''}`.trim() || null,
          },
        },
        client,
      );
      await this.requestRepo.linkApprovalRequest(
        request.id,
        approvalRequest.id,
        client,
      );
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'COMMUNITY',
          action: 'COMMUNITY_MEMBERSHIP_REMOVE_REQUESTED',
          objectType: 'community_membership_request',
          objectId: request.id,
          outcome: 'SUCCESS',
          afterData: { communityId, membershipId: dto.membershipId },
        },
        client,
      );
      return { ...request, approvalRequestId: approvalRequest.id };
    });
  }

  async list(
    actor: AuthenticatedUser,
  ): Promise<CommunityMembershipRequestRow[]> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    return this.requestRepo.findByCommunityId(communityId);
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CommunityMembershipRequestRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    const request = await this.requestRepo.findById(id);
    if (!request || request.communityId !== communityId) {
      throw new NotFoundException('Membership request not found');
    }
    return request;
  }

  /** Minimal fields only (id, name, admissionNo) -- same shape
   * StudentPersonPicker already exposes elsewhere. Excludes students who
   * already have a community_membership row here (active OR removed) --
   * both would fail assertNoExistingMembershipRow anyway -- and students
   * with a PENDING ADD request here (would fail assertNoPendingAddRequest)
   * -- so there's no reason to ever surface either as a valid pick. */
  async searchStudents(
    search: string,
    actor: AuthenticatedUser,
  ): Promise<
    {
      id: string;
      firstName: string;
      lastName: string | null;
      admissionNo: string;
    }[]
  > {
    const trimmed = search.trim();
    if (trimmed.length < 2) return [];
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);

    const { rows } = await this.postgres.query<{
      id: string;
      firstName: string;
      lastName: string | null;
      admissionNo: string;
    }>(
      `SELECT s.id, p.first_name AS "firstName", p.last_name AS "lastName", s.admission_no AS "admissionNo"
       FROM student s
       JOIN person p ON p.id = s.person_id
       WHERE s.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM community_membership cm WHERE cm.community_id = $1 AND cm.student_id = s.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM community_membership_request cmr
           WHERE cmr.community_id = $1 AND cmr.student_id = s.id AND cmr.action = 'ADD' AND cmr.status = 'PENDING'
         )
         AND (p.first_name ILIKE $2 OR p.last_name ILIKE $2 OR s.admission_no ILIKE $2)
       ORDER BY p.first_name
       LIMIT 8`,
      [communityId, `%${trimmed}%`],
    );
    return rows;
  }
}
