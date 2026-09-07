import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ExamRepository } from './repositories/exam.repository';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ListExamsQueryDto } from './dto/list-exams.query.dto';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { isCheckViolation, isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class ExamsService {
  constructor(
    private readonly examRepo: ExamRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: ListExamsQueryDto) {
    return this.examRepo.findMany({ academicYearId: query.academicYearId, state: query.state });
  }

  async get(id: string) {
    const exam = await this.examRepo.findById(id);
    if (!exam) throw new NotFoundException('Examination not found');
    return exam;
  }

  async create(dto: CreateExamDto, actorPersonId: string) {
    try {
      const created = await this.examRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'EXAM_CREATED',
        objectType: 'exam',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('academicYearId or gradeScaleId does not reference a real row.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateExamDto, actorPersonId: string) {
    const existing = await this.get(id);
    if (existing.state === 'LOCKED') {
      throw new BadRequestException('This examination is locked and can no longer be edited.');
    }
    try {
      const updated = await this.examRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Examination not found');
      await this.auditService.record({
        actorPersonId,
        action: 'EXAM_UPDATED',
        objectType: 'exam',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('gradeScaleId does not reference a real row.');
      }
      throw err;
    }
  }

  async publish(id: string, actorPersonId: string) {
    const existing = await this.get(id);
    if (existing.state === 'PUBLISHED' || existing.state === 'LOCKED') {
      throw new BadRequestException('This examination is already published.');
    }
    const schedules = await this.examRepo.findSchedulesByExamId(id);
    if (schedules.length === 0) {
      throw new BadRequestException('Add at least one subject to the schedule before publishing.');
    }
    const updated = await this.examRepo.publish(id, actorPersonId);
    if (!updated) throw new NotFoundException('Examination not found');
    await this.auditService.record({
      actorPersonId,
      action: 'EXAM_PUBLISHED',
      objectType: 'exam',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async lock(id: string, actorPersonId: string) {
    const existing = await this.get(id);
    if (existing.state !== 'PUBLISHED') {
      throw new BadRequestException('An examination must be published before it can be locked.');
    }
    const updated = await this.examRepo.lock(id);
    if (!updated) throw new NotFoundException('Examination not found');
    await this.auditService.record({
      actorPersonId,
      action: 'EXAM_LOCKED',
      objectType: 'exam',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async listSchedules(examId: string) {
    await this.get(examId);
    return this.examRepo.findSchedulesByExamId(examId);
  }

  async createSchedule(examId: string, dto: CreateExamScheduleDto, actorPersonId: string) {
    const exam = await this.get(examId);
    if (exam.state === 'LOCKED') {
      throw new BadRequestException('This examination is locked and its schedule can no longer be edited.');
    }
    try {
      const created = await this.examRepo.createSchedule(examId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'EXAM_SCHEDULE_CREATED',
        objectType: 'exam_subject',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('subjectOfferingId does not reference a real subject offering.');
      }
      if (isCheckViolation(err)) {
        throw new BadRequestException(
          'Check the marks: pass marks must not exceed max marks, and a practical max is required when "has practical" is on.',
        );
      }
      throw err;
    }
  }

  async updateSchedule(scheduleId: string, dto: UpdateExamScheduleDto, actorPersonId: string) {
    const existing = await this.examRepo.findScheduleById(scheduleId);
    if (!existing) throw new NotFoundException('Examination schedule entry not found');
    const exam = await this.get(existing.examId);
    if (exam.state === 'LOCKED') {
      throw new BadRequestException('This examination is locked and its schedule can no longer be edited.');
    }
    let updated;
    try {
      updated = await this.examRepo.updateSchedule(scheduleId, dto);
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException(
          'Check the marks: pass marks must not exceed max marks, and a practical max is required when "has practical" is on.',
        );
      }
      throw err;
    }
    if (!updated) throw new NotFoundException('Examination schedule entry not found');
    await this.auditService.record({
      actorPersonId,
      action: 'EXAM_SCHEDULE_UPDATED',
      objectType: 'exam_subject',
      objectId: scheduleId,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
