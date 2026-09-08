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
import { CompleteInitiativeDto } from './dto/complete-initiative.dto';
import { CreateCommunityInitiativeDto } from './dto/create-community-initiative.dto';
import { UpdateCommunityInitiativeDto } from './dto/update-community-initiative.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import {
  CommunityInitiativeRepository,
  CommunityInitiativeRow,
} from './repositories/community-initiative.repository';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class CommunityInitiativesService {
  constructor(
    private readonly initiativeRepo: CommunityInitiativeRepository,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly postgres: PostgresService,
  ) {}

  /** Same resolution as CommunityProposalsService -- duplicated rather than
   * imported cross-module, to avoid coupling this module to Phase 5's
   * internals (matches this codebase's convention: cross-module data is
   * referenced by opaque FK/raw read, not by importing another module's
   * repository, unless the modules genuinely share a service). */
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

  /** Read-only cross-check against community_proposal -- a raw, minimal read,
   * not a repository import, same reasoning as above. */
  private async findApprovedOwnProposal(
    proposalId: string,
    communityId: string,
  ) {
    const { rows } = await this.postgres.query<{
      id: string;
      community_id: string;
      title: string;
      description: string;
      status: string;
    }>(
      `SELECT id, community_id, title, description, status FROM community_proposal WHERE id = $1`,
      [proposalId],
    );
    const proposal = rows[0];
    // Not found AND wrong-community both behave identically -- never leak
    // whether a proposal id belonging to another community exists.
    if (!proposal || proposal.community_id !== communityId) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.status !== 'APPROVED') {
      throw new ConflictException(
        'Only an approved proposal can be initialized into an activity.',
      );
    }
    return proposal;
  }

  async create(
    dto: CreateCommunityInitiativeDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    const proposal = await this.findApprovedOwnProposal(
      dto.proposalId,
      communityId,
    );

    return this.unitOfWork.run(async (client) => {
      try {
        const initiative = await this.initiativeRepo.create(
          {
            communityId,
            proposalId: proposal.id,
            title: proposal.title,
            description: proposal.description,
            plannedDate: dto.plannedDate,
            venue: dto.venue,
            createdBy: actor.personId,
          },
          client,
        );
        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'COMMUNITY',
            action: 'COMMUNITY_INITIATIVE_CREATED',
            objectType: 'community_initiative',
            objectId: initiative.id,
            outcome: 'SUCCESS',
            afterData: initiative,
          },
          client,
        );
        return initiative;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(
            'This proposal has already been initialized into an activity.',
          );
        }
        if (isForeignKeyViolation(err)) {
          throw new NotFoundException('Proposal not found');
        }
        throw err;
      }
    });
  }

  async list(actor: AuthenticatedUser): Promise<CommunityInitiativeRow[]> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    return this.initiativeRepo.findByCommunityId(communityId);
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const communityId = await this.resolveAuthorizedCommunityId(actor.personId);
    const initiative = await this.initiativeRepo.findById(id);
    if (!initiative || initiative.communityId !== communityId) {
      throw new NotFoundException('Activity not found');
    }
    return initiative;
  }

  /** Phase 9 -- "manage its own activities": editable only while PLANNED, i.e.
   * before any real work (progress/outcome) has been recorded against it.
   * Never accepts communityId/proposalId/createdBy/status -- those stay
   * immutable for the activity's whole life, enforced by the DTO shape (they
   * don't exist as fields) as well as this explicit state check. */
  async update(
    id: string,
    dto: UpdateCommunityInitiativeDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const existing = await this.getById(id, actor);
    if (existing.status !== 'PLANNED') {
      throw new ConflictException('Only a planned activity can be edited.');
    }
    const updated = await this.initiativeRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Activity not found');
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'COMMUNITY',
      action: 'COMMUNITY_INITIATIVE_UPDATED',
      objectType: 'community_initiative',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async start(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const existing = await this.getById(id, actor);
    if (existing.status !== 'PLANNED') {
      throw new ConflictException('Only a planned activity can be started.');
    }
    return this.transition(
      id,
      existing,
      'IN_PROGRESS',
      () => this.initiativeRepo.start(id),
      actor,
    );
  }

  async complete(
    id: string,
    dto: CompleteInitiativeDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const existing = await this.getById(id, actor);
    if (existing.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'Only an in-progress activity can be completed.',
      );
    }
    return this.transition(
      id,
      existing,
      'COMPLETED',
      () => this.initiativeRepo.complete(id, dto.outcome ?? null),
      actor,
    );
  }

  /** Progress is a single overwritable field, not a log -- the audit record
   * below (before/after) is the real historical trail, matching this
   * codebase's own convention (see 0011_community_initiative_progress.sql). */
  async updateProgress(
    id: string,
    dto: UpdateProgressDto,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const existing = await this.getById(id, actor);
    if (existing.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'Progress can only be recorded while an activity is in progress.',
      );
    }
    const updated = await this.initiativeRepo.updateProgress(
      id,
      dto.progressNotes,
    );
    if (!updated) throw new NotFoundException('Activity not found');
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'COMMUNITY',
      action: 'COMMUNITY_INITIATIVE_PROGRESS_UPDATED',
      objectType: 'community_initiative',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  private async transition(
    id: string,
    existing: CommunityInitiativeRow,
    newStatus: string,
    apply: () => Promise<CommunityInitiativeRow | null>,
    actor: AuthenticatedUser,
  ): Promise<CommunityInitiativeRow> {
    const updated = await apply();
    if (!updated) throw new NotFoundException('Activity not found');
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'COMMUNITY',
      action: `COMMUNITY_INITIATIVE_${newStatus}`,
      objectType: 'community_initiative',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
