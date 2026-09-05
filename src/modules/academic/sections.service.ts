import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SectionRepository } from './repositories/section.repository';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { SectionQueryDto } from './dto/section-query.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class SectionsService {
  constructor(
    private readonly sectionRepo: SectionRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: SectionQueryDto) {
    return this.sectionRepo.findMany(query);
  }

  async get(id: string) {
    const section = await this.sectionRepo.findById(id);
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  async create(dto: CreateSectionDto, actorPersonId: string) {
    try {
      const created = await this.sectionRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'SECTION_CREATED',
        objectType: 'section',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A section with this name already exists for this academic year/grade/medium.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new ConflictException('academicYearId, gradeId, mediumId, or campusId does not exist.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateSectionDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.sectionRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Section not found');
      await this.auditService.record({
        actorPersonId,
        action: 'SECTION_UPDATED',
        objectType: 'section',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A section with this name already exists for this academic year/grade/medium.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new ConflictException('campusId does not exist.');
      }
      throw err;
    }
  }
}
