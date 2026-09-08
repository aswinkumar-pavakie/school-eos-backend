import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CommunitiesService } from './communities.service';
import { CommunityActivityRepository } from './repositories/community-activity.repository';

@Injectable()
export class CommunityActivitiesService {
  constructor(
    private readonly activityRepo: CommunityActivityRepository,
    private readonly communitiesService: CommunitiesService,
    private readonly auditService: AuditService,
  ) {}

  async listByCommunity(communityId: string) {
    await this.communitiesService.get(communityId);
    return this.activityRepo.findByCommunityId(communityId);
  }

  async create(
    communityId: string,
    dto: CreateActivityDto,
    actorPersonId: string,
  ) {
    await this.communitiesService.get(communityId);
    const created = await this.activityRepo.create({
      communityId,
      title: dto.title,
      description: dto.description ?? null,
      scheduledAt: dto.scheduledAt,
      venue: dto.venue ?? null,
      createdBy: actorPersonId,
    });
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_ACTIVITY_CREATED',
      objectType: 'community_activity',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async update(id: string, dto: UpdateActivityDto, actorPersonId: string) {
    const existing = await this.activityRepo.findById(id);
    if (!existing) throw new NotFoundException('Community activity not found');
    const updated = await this.activityRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Community activity not found');
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_ACTIVITY_UPDATED',
      objectType: 'community_activity',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
