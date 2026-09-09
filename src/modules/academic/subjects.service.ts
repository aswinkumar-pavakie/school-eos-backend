import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SubjectRepository } from './repositories/subject.repository';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly subjectRepo: SubjectRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.subjectRepo.findMany();
  }

  async get(id: string) {
    const subject = await this.subjectRepo.findById(id);
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  async create(dto: CreateSubjectDto, actorPersonId: string) {
    try {
      const created = await this.subjectRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'SUBJECT_CREATED',
        objectType: 'subject',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException('A subject with this code already exists.');
      if (isForeignKeyViolation(err))
        throw new ConflictException('departmentId does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateSubjectDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.subjectRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Subject not found');
      await this.auditService.record({
        actorPersonId,
        action: 'SUBJECT_UPDATED',
        objectType: 'subject',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException('A subject with this code already exists.');
      if (isForeignKeyViolation(err))
        throw new ConflictException('departmentId does not exist.');
      throw err;
    }
  }
}
