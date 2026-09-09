import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { isForeignKeyViolation } from './pg-error.util';
import {
  AnnouncementRepository,
  type AudienceRow,
} from './repositories/announcement.repository';

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

  /** Everything relevant to a Faculty caller: SCHOOL-wide, ROLE=FACULTY, and
   * any SECTION-targeted announcement aimed at one of their own scoped
   * sections (advisor + teaching, resolved by the caller). Reused both by the
   * Faculty Announcements screen and by the Home feed. */
  listForFaculty(sectionIds: string[]) {
    return this.announcementRepo.findMany({ roleCode: 'FACULTY', sectionIds });
  }

  /** Everything relevant to a Parent caller: SCHOOL-wide, ROLE=PARENT, and
   * any SECTION-targeted announcement aimed at their child's own current
   * section -- same shape as listForFaculty above, just PARENT's own role
   * code and the child's one real section instead of a faculty member's
   * several. Reused both by a Parent Announcements screen and the Home feed. */
  listForParent(sectionIds: string[]) {
    return this.announcementRepo.findMany({ roleCode: 'PARENT', sectionIds });
  }

  /** Announcements a Faculty member can manage (edit/delete) -- their own,
   * regardless of audience. */
  listCreatedBy(personId: string) {
    return this.announcementRepo.findMany({ createdBy: personId, includeArchived: true });
  }

  private buildAudiences(dto: { audienceType: string; targetRoles?: string[]; targetSectionIds?: string[] }): AudienceRow[] {
    if (dto.audienceType === 'SCHOOL') {
      return [{ audienceType: 'SCHOOL', targetId: null, targetStage: null, targetRole: null }];
    }
    if (dto.audienceType === 'SECTION') {
      if (!dto.targetSectionIds || dto.targetSectionIds.length === 0) {
        throw new BadRequestException('targetSectionIds is required when audienceType is SECTION.');
      }
      return dto.targetSectionIds.map((sectionId) => ({
        audienceType: 'SECTION',
        targetId: sectionId,
        targetStage: null,
        targetRole: null,
      }));
    }
    if (!dto.targetRoles || dto.targetRoles.length === 0) {
      throw new BadRequestException('targetRoles is required when audienceType is ROLE.');
    }
    return dto.targetRoles.map((role) => ({
      audienceType: 'ROLE',
      targetId: null,
      targetStage: null,
      targetRole: role,
    }));
  }

  async create(dto: CreateAnnouncementDto, actorPersonId: string) {
    const audiences = this.buildAudiences(dto);

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
        throw new BadRequestException('One of the target roles/sections is not real.');
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

  /** `restrictToOwnerId`, when given, enforces that only the announcement's own
   * creator may edit it (the Faculty CRUD boundary -- ADMIN callers omit it). */
  async update(id: string, dto: UpdateAnnouncementDto, actorPersonId: string, restrictToOwnerId?: string) {
    const existing = await this.announcementRepo.findById(id);
    if (!existing) throw new NotFoundException('Announcement not found');
    if (restrictToOwnerId && existing.createdBy !== restrictToOwnerId) {
      throw new ForbiddenException('You can only edit your own announcements.');
    }

    const audiences = dto.audienceType ? this.buildAudiences(dto as CreateAnnouncementDto) : undefined;

    try {
      const updated = await this.announcementRepo.update(id, {
        title: dto.title,
        body: dto.body,
        category: dto.category,
        priority: dto.priority,
        isEmergency: dto.isEmergency,
        expiresAt: dto.expiresAt,
        audiences,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'ANNOUNCEMENT_UPDATED',
        objectType: 'announcement',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('One of the target roles/sections is not real.');
      }
      throw err;
    }
  }

  /** Same ownership rule as update(). */
  async remove(id: string, actorPersonId: string, restrictToOwnerId?: string) {
    const existing = await this.announcementRepo.findById(id);
    if (!existing) throw new NotFoundException('Announcement not found');
    if (restrictToOwnerId && existing.createdBy !== restrictToOwnerId) {
      throw new ForbiddenException('You can only delete your own announcements.');
    }
    await this.announcementRepo.delete(id);
    await this.auditService.record({
      actorPersonId,
      action: 'ANNOUNCEMENT_DELETED',
      objectType: 'announcement',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }
}
