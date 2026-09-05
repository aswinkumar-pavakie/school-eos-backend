import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Queryable } from '../../infrastructure/postgres/postgres.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { CommunitiesService } from './communities.service';
import { CommunityMembershipRepository } from './repositories/community-membership.repository';

@Injectable()
export class CommunityMembershipsService {
  constructor(
    private readonly membershipRepo: CommunityMembershipRepository,
    private readonly communitiesService: CommunitiesService,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async listByCommunity(communityId: string) {
    await this.communitiesService.get(communityId);
    return this.membershipRepo.findByCommunityId(communityId);
  }

  private async getRow(id: string, executor?: Queryable) {
    const row = await this.membershipRepo.findById(id, executor);
    if (!row) throw new NotFoundException('Community membership not found');
    return row;
  }

  /** Always created PENDING_CONSENT -- there is no valid create path that starts
   * ACTIVE, matching the membership_consent CHECK (status='ACTIVE' iff
   * parent_consent_at is set). */
  async create(communityId: string, dto: CreateMembershipDto, actorPersonId: string) {
    await this.communitiesService.get(communityId);
    try {
      const { id } = await this.membershipRepo.create({
        communityId,
        studentId: dto.studentId,
        roleInCommunity: dto.roleInCommunity,
        addedBy: actorPersonId,
      });
      const created = await this.getRow(id);
      await this.auditService.record({
        actorPersonId,
        action: 'COMMUNITY_MEMBERSHIP_CREATED',
        objectType: 'community_membership',
        objectId: id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('This student is already a member of this community.');
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException('studentId does not refer to an existing record.');
      }
      throw err;
    }
  }

  /** Atomic: status -> ACTIVE and parent_consent_at -> now() together. */
  async recordConsent(id: string, actorPersonId: string) {
    const existing = await this.getRow(id);
    if (existing.status !== 'PENDING_CONSENT') {
      throw new BadRequestException('Consent can only be recorded for a membership pending consent.');
    }
    return this.unitOfWork.run(async (client) => {
      const updated = await this.membershipRepo.recordConsent(id, client);
      if (!updated) throw new NotFoundException('Community membership not found');
      const row = await this.getRow(id, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'COMMUNITY_MEMBERSHIP_CONSENT_RECORDED',
          objectType: 'community_membership',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: existing,
          afterData: row,
        },
        client,
      );
      return row;
    });
  }

  /** Atomic: status -> REMOVED, parent_consent_at cleared back to null. */
  async remove(id: string, actorPersonId: string) {
    const existing = await this.getRow(id);
    if (existing.status === 'REMOVED') {
      throw new BadRequestException('This membership has already been removed.');
    }
    return this.unitOfWork.run(async (client) => {
      const updated = await this.membershipRepo.remove(id, client);
      if (!updated) throw new NotFoundException('Community membership not found');
      const row = await this.getRow(id, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'COMMUNITY_MEMBERSHIP_REMOVED',
          objectType: 'community_membership',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: existing,
          afterData: row,
        },
        client,
      );
      return row;
    });
  }
}
