import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { CommunitiesService } from './communities.service';
import { CommunityPositionRepository } from './repositories/community-position.repository';

@Injectable()
export class CommunityPositionsService {
  constructor(
    private readonly positionRepo: CommunityPositionRepository,
    private readonly communitiesService: CommunitiesService,
    private readonly auditService: AuditService,
  ) {}

  async listByCommunity(communityId: string) {
    await this.communitiesService.get(communityId);
    return this.positionRepo.findByCommunityId(communityId);
  }

  async create(
    communityId: string,
    dto: CreatePositionDto,
    actorPersonId: string,
  ) {
    await this.communitiesService.get(communityId);
    const created = await this.positionRepo.create({
      communityId,
      title: dto.title,
      assigneeType: dto.assigneeType,
      assigneeStaffId: dto.assigneeType === 'STAFF' ? dto.assigneeStaffId : null,
      assigneeStudentId: dto.assigneeType === 'STUDENT' ? dto.assigneeStudentId : null,
      createdBy: actorPersonId,
    });
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_POSITION_CREATED',
      objectType: 'community_position',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async update(id: string, dto: UpdatePositionDto, actorPersonId: string) {
    const existing = await this.positionRepo.findById(id);
    if (!existing) throw new NotFoundException('Position not found');
    const updated = await this.positionRepo.update(id, {
      title: dto.title,
      assigneeType: dto.assigneeType,
      assigneeStaffId: dto.assigneeType === 'STAFF' ? dto.assigneeStaffId : null,
      assigneeStudentId: dto.assigneeType === 'STUDENT' ? dto.assigneeStudentId : null,
    });
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_POSITION_UPDATED',
      objectType: 'community_position',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async remove(id: string, actorPersonId: string) {
    const existing = await this.positionRepo.findById(id);
    if (!existing) throw new NotFoundException('Position not found');
    await this.positionRepo.delete(id);
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_POSITION_DELETED',
      objectType: 'community_position',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }
}
