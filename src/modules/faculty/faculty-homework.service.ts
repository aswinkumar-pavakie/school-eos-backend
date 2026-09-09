// Homework -- scoped by "classes I teach" (subject_offering), same scope as
// Marks Entry/Subject Records, never advisor scope. Full CRUD on the
// assignment itself (create/edit/delete); the actual student submission is
// the Parent/Student app's own job (explicitly out of scope here, same as
// Leave's own creation path) -- this module only tracks and reports on it.

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { HOMEWORK_SUBMISSIONS_BUCKET } from '../parent/homework-storage.util';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { HomeworkRepository } from './repositories/homework.repository';

const SUBMISSION_FILE_URL_TTL_SECONDS = 60 * 10;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class FacultyHomeworkService {
  constructor(
    private readonly homeworkRepo: HomeworkRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private async assertOwnsHomework(personId: string, homeworkId: string) {
    const homework = await this.homeworkRepo.findById(homeworkId);
    if (!homework) throw new NotFoundException('Homework not found');
    const owns = await this.scopeRepo.ownsOffering(personId, homework.subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    return homework;
  }

  async list(personId: string) {
    const offerings = await this.scopeRepo.getTeachingOfferings(personId);
    const items = await this.homeworkRepo.findForOfferings(offerings.map((o) => o.subjectOfferingId));

    const today = todayIso();
    const open = items.filter((h) => h.status === 'PUBLISHED' && h.dueDate >= today);
    const dueToday = open.filter((h) => h.dueDate === today);
    const ungraded = open.reduce((sum, h) => sum + (h.finishedCount - h.gradedCount), 0);

    return {
      items,
      stats: { open: open.length, dueToday: dueToday.length, ungraded },
      classes: offerings.map((o) => ({ subjectOfferingId: o.subjectOfferingId, label: `${o.gradeName}-${o.sectionName} · ${o.subjectName}` })),
    };
  }

  async create(personId: string, dto: CreateHomeworkDto) {
    const owns = await this.scopeRepo.ownsOffering(personId, dto.subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    if (dto.dueDate < todayIso()) {
      throw new BadRequestException('Due date cannot be in the past.');
    }

    return this.unitOfWork.run(async (client) => {
      const id = await this.homeworkRepo.create(
        {
          subjectOfferingId: dto.subjectOfferingId,
          title: dto.title,
          description: dto.description ?? null,
          attachmentKeys: dto.attachmentKeys ?? null,
          dueDate: dto.dueDate,
          maxMarks: dto.maxMarks ?? null,
          assignedBy: personId,
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'HOMEWORK_CREATED',
          objectType: 'homework',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: dto,
        },
        client,
      );
      return this.homeworkRepo.findById(id, client);
    });
  }

  async update(personId: string, id: string, dto: UpdateHomeworkDto) {
    const existing = await this.assertOwnsHomework(personId, id);
    if (dto.dueDate && dto.dueDate < existing.assignedOn) {
      throw new BadRequestException('Due date cannot be before the assigned date.');
    }
    await this.homeworkRepo.update(id, dto);
    const updated = await this.homeworkRepo.findById(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'HOMEWORK_UPDATED',
      objectType: 'homework',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async remove(personId: string, id: string) {
    const existing = await this.assertOwnsHomework(personId, id);
    await this.homeworkRepo.delete(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'HOMEWORK_DELETED',
      objectType: 'homework',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }

  async getRoster(personId: string, id: string, tab?: 'DONE' | 'NOT_DONE') {
    const homework = await this.assertOwnsHomework(personId, id);
    const roster = await this.homeworkRepo.findRoster(id);
    const filtered =
      tab === 'DONE'
        ? roster.filter((r) => ['SUBMITTED', 'LATE', 'GRADED'].includes(r.status))
        : tab === 'NOT_DONE'
          ? roster.filter((r) => ['PENDING', 'NOT_DONE'].includes(r.status))
          : roster;
    return { homework, roster: filtered };
  }

  /** Lets the teacher who owns this homework open a signed URL for exactly
   * one file a student (via their parent) submitted -- verifies the
   * requested key genuinely belongs to that student's own submission first. */
  async getSubmissionFileUrl(personId: string, homeworkId: string, studentId: string, objectKey: string): Promise<string> {
    await this.assertOwnsHomework(personId, homeworkId);
    const objectKeys = await this.homeworkRepo.findSubmissionObjectKeys(homeworkId, studentId);
    if (!objectKeys?.includes(objectKey)) {
      throw new NotFoundException('File not found on this submission.');
    }
    return this.storage.createSignedUrl(HOMEWORK_SUBMISSIONS_BUCKET, objectKey, SUBMISSION_FILE_URL_TTL_SECONDS);
  }
}
