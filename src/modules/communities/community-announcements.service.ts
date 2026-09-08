import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { CommunitiesService } from './communities.service';
import { CommunityAnnouncementRepository } from './repositories/community-announcement.repository';

@Injectable()
export class CommunityAnnouncementsService {
  constructor(
    private readonly announcementRepo: CommunityAnnouncementRepository,
    private readonly communitiesService: CommunitiesService,
    private readonly auditService: AuditService,
  ) {}

  async listByCommunity(communityId: string) {
    await this.communitiesService.get(communityId);
    return this.announcementRepo.findByCommunityId(communityId);
  }

  async create(
    communityId: string,
    dto: CreateAnnouncementDto,
    actorPersonId: string,
  ) {
    await this.communitiesService.get(communityId);
    const created = await this.announcementRepo.create({
      communityId,
      title: dto.title,
      body: dto.body,
      publishedBy: actorPersonId,
      state: dto.state,
    });
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_ANNOUNCEMENT_CREATED',
      objectType: 'community_announcement',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto, actorPersonId: string) {
    const existing = await this.announcementRepo.findById(id);
    if (!existing)
      throw new NotFoundException('Community announcement not found');
    const updated = await this.announcementRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException('Community announcement not found');
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_ANNOUNCEMENT_UPDATED',
      objectType: 'community_announcement',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
