import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GradeRepository } from './repositories/grade.repository';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { isUniqueViolation } from './pg-error.util';

@Injectable()
export class GradesService {
  constructor(
    private readonly gradeRepo: GradeRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.gradeRepo.findMany();
  }

  async get(id: string) {
    const grade = await this.gradeRepo.findById(id);
    if (!grade) throw new NotFoundException('Grade not found');
    return grade;
  }

  async create(dto: CreateGradeDto, actorPersonId: string) {
    try {
      const created = await this.gradeRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'GRADE_CREATED',
        objectType: 'grade',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A grade with this name or level_no already exists.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateGradeDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.gradeRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Grade not found');
      await this.auditService.record({
        actorPersonId,
        action: 'GRADE_UPDATED',
        objectType: 'grade',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A grade with this name or level_no already exists.');
      }
      throw err;
    }
  }
}
