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
import { CreateCommunityProposalDto } from './dto/create-community-proposal.dto';
import { ResubmitCommunityProposalDto } from './dto/resubmit-community-proposal.dto';
import {
  CommunityProposalRepository,
  CommunityProposalRow,
} from './repositories/community-proposal.repository';
import { isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class CommunityProposalsService {
  constructor(
    private readonly proposalRepo: CommunityProposalRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly postgres: PostgresService,
  ) {}

  /** The one authorization-critical lookup in this whole module: resolves which
   * real community this Community login represents, from their own
   * role_assignment row -- never from anything the client supplies. A
   * COMMUNITY account with no such scoped assignment (mis-provisioned) is
   * treated as fully unauthorized, not silently given access to everything. */
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

  async create(
    dto: CreateCommunityProposalDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityProposalRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    return this.unitOfWork.run(async (client) => {
      try {
        const proposal = await this.proposalRepo.create(
          {
            communityId,
            requestedBy: actor.personId,
            title: dto.title,
            description: dto.description,
          },
          client,
        );
        const approvalRequest = await this.approvalsService.createRequest(
          {
            requestType: 'COMMUNITY_PROPOSAL',
            subjectObjectType: 'community_proposal',
            subjectObjectId: proposal.id,
            requestedBy: actor.personId,
            payload: { title: dto.title },
          },
          client,
        );
        await this.proposalRepo.linkApprovalRequest(
          proposal.id,
          approvalRequest.id,
          client,
        );
        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'COMMUNITY',
            action: 'COMMUNITY_PROPOSAL_CREATED',
            objectType: 'community_proposal',
            objectId: proposal.id,
            outcome: 'SUCCESS',
            afterData: {
              communityId,
              title: dto.title,
              description: dto.description,
            },
          },
          client,
        );
        return { ...proposal, approvalRequestId: approvalRequest.id };
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new NotFoundException('Your community could not be found.');
        }
        throw err;
      }
    });
  }

  async list(actor: AuthenticatedUser): Promise<CommunityProposalRow[]> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    return this.proposalRepo.findByCommunityId(communityId);
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CommunityProposalRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    const proposal = await this.proposalRepo.findById(id);
    // Not found AND wrong-community both 404, identically -- a Community user
    // must never learn that a proposal id belonging to another community even
    // exists.
    if (!proposal || proposal.communityId !== communityId) {
      throw new NotFoundException('Proposal not found');
    }
    return proposal;
  }

  /** Resubmission is deliberately NOT built into the generic approvals engine
   * (see approval-request.repository.ts's own markSentBack comment: "resubmission
   * ... is a separate, not-yet-built workflow, deliberately not invented here").
   * This calls the exact same createRequest() every initial submission uses, a
   * second time -- a brand-new PENDING approval_request, not a resurrection of
   * the SENT_BACK one. The old approval_request is left untouched as a real
   * historical record of the reviewer's original decision and comment. */
  async resubmit(
    id: string,
    dto: ResubmitCommunityProposalDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityProposalRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    const existing = await this.proposalRepo.findById(id);
    if (!existing || existing.communityId !== communityId) {
      throw new NotFoundException('Proposal not found');
    }
    if (existing.status !== 'SENT_BACK') {
      throw new ConflictException(
        'Only a sent-back proposal can be resubmitted.',
      );
    }

    return this.unitOfWork.run(async (client) => {
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'COMMUNITY_PROPOSAL',
          subjectObjectType: 'community_proposal',
          subjectObjectId: id,
          requestedBy: actor.personId,
          payload: { title: dto.title ?? existing.title },
        },
        client,
      );
      const updated = await this.proposalRepo.resubmit(
        id,
        {
          title: dto.title,
          description: dto.description,
          approvalRequestId: approvalRequest.id,
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'COMMUNITY',
          action: 'COMMUNITY_PROPOSAL_RESUBMITTED',
          objectType: 'community_proposal',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: existing,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }
}
