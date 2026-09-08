import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SubjectOfferingQueryDto } from './dto/subject-offering-query.dto';
import { UpdateSubjectOfferingTeacherDto } from './dto/update-subject-offering-teacher.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { SubjectOfferingRepository } from './repositories/subject-offering.repository';

@Injectable()
export class SubjectOfferingsService {
  constructor(
    private readonly subjectOfferingRepo: SubjectOfferingRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: SubjectOfferingQueryDto) {
    return this.subjectOfferingRepo.findBySection(query.sectionId);
  }

  /** "Which subjects is this faculty handling" -- the reverse lookup, used by
   * the Faculty profile page. */
  async listForTeacher(teacherStaffId: string) {
    return this.subjectOfferingRepo.findByTeacher(teacherStaffId);
  }

  async assignTeacher(id: string, dto: UpdateSubjectOfferingTeacherDto, actorPersonId: string) {
    const existing = await this.subjectOfferingRepo.findById(id);
    if (!existing) throw new NotFoundException('Subject offering not found');
    if (existing.teacherStaffId === dto.teacherStaffId) {
      throw new BadRequestException('This staff member already teaches this subject offering.');
    }

    try {
      const updated = await this.subjectOfferingRepo.updateTeacher(id, dto.teacherStaffId);
      if (!updated) throw new NotFoundException('Subject offering not found');

      await this.auditService.record({
        actorPersonId,
        action: 'SUBJECT_OFFERING_TEACHER_ASSIGNED',
        objectType: 'subject_offering',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: { teacherStaffId: existing.teacherStaffId },
        afterData: { teacherStaffId: updated.teacherStaffId },
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('teacherStaffId does not exist.');
      }
      throw err;
    }
  }
}
