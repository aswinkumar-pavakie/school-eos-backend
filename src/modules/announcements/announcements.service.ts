import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { AnnouncementRepository, type AudienceRow } from './repositories/announcement.repository';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly announcementRepo: AnnouncementRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: AnnouncementQueryDto) {
    return this.announcementRepo.findMany({
      roleCode: query.roleCode,
      includeArchived: query.includeArchived === 'true',
    });
  }

  async create(dto: CreateAnnouncementDto, actorPersonId: string) {
    let audiences: AudienceRow[];
    if (dto.audienceType === 'SCHOOL') {
      audiences = [{ audienceType: 'SCHOOL', targetId: null, targetStage: null, targetRole: null }];
    } else {
      if (!dto.targetRoles || dto.targetRoles.length === 0) {
        throw new BadRequestException('targetRoles is required when audienceType is ROLE.');
      }
      audiences = dto.targetRoles.map((role) => ({
        audienceType: 'ROLE',
        targetId: null,
        targetStage: null,
        targetRole: role,
      }));
    }

    try {
      const created = await this.announcementRepo.create({
        title: dto.title,
        body: dto.body,
        category: dto.category ?? null,
        priority: dto.priority,
        isEmergency: dto.isEmergency,
        expiresAt: dto.expiresAt ?? null,
        createdBy: actorPersonId,
        audiences,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'ANNOUNCEMENT_CREATED',
        objectType: 'announcement',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('One of the target roles is not a real role_code.');
      }
      throw err;
    }
  }

  async archive(id: string, actorPersonId: string) {
    const existing = await this.announcementRepo.findById(id);
    if (!existing) throw new NotFoundException('Announcement not found');
    const updated = await this.announcementRepo.setState(id, 'ARCHIVED');
    await this.auditService.record({
      actorPersonId,
      action: 'ANNOUNCEMENT_ARCHIVED',
      objectType: 'announcement',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
