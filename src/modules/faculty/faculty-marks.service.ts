// Marks Entry -- a subject teacher's own exam_subject rows, scoped strictly to
// subject_offerings they actually teach (never another teacher's class, and
// never a subject they don't teach even within their own advisor section).
// Real draft (mark.state='ENTERED') vs published (mark.state='PUBLISHED')
// lifecycle, exactly as already modeled at the DB level -- entry itself is
// only ever allowed while the parent exam is in its own real 'MARKS_ENTRY'
// state.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { SaveMarksDto } from './dto/save-marks.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { MarksRepository } from './repositories/marks.repository';

@Injectable()
export class FacultyMarksService {
  constructor(
    private readonly marksRepo: MarksRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  private async assertOwnsExamSubject(personId: string, examSubjectId: string) {
    const examSubject = await this.marksRepo.findExamSubjectById(examSubjectId);
    if (!examSubject) throw new NotFoundException('Exam not found');
    const owns = await this.scopeRepo.ownsOffering(
      personId,
      examSubject.subjectOfferingId,
    );
    if (!owns)
      throw new ForbiddenException(
        'You do not teach this subject for this class.',
      );
    return examSubject;
  }

  async listExamsForOffering(personId: string, subjectOfferingId: string) {
    const owns = await this.scopeRepo.ownsOffering(personId, subjectOfferingId);
    if (!owns)
      throw new ForbiddenException(
        'You do not teach this subject for this class.',
      );
    return this.marksRepo.findExamSubjectsForOffering(subjectOfferingId);
  }

  async getRoster(personId: string, examSubjectId: string) {
    const examSubject = await this.assertOwnsExamSubject(
      personId,
      examSubjectId,
    );
    const roster = await this.marksRepo.findRosterWithMarks(
      examSubject.sectionId,
      examSubjectId,
    );
    return { examSubject, roster };
  }

  async save(personId: string, examSubjectId: string, dto: SaveMarksDto) {
    const examSubject = await this.assertOwnsExamSubject(
      personId,
      examSubjectId,
    );
    if (examSubject.examState !== 'MARKS_ENTRY') {
      throw new ConflictException(
        `Marks entry for "${examSubject.examName}" is not open right now (current status: ${examSubject.examState}).`,
      );
    }
    for (const entry of dto.entries) {
      if (entry.isAbsent && entry.marksObtained !== undefined) {
        throw new BadRequestException(
          `${entry.studentId}: an absent student cannot also have marks entered.`,
        );
      }
      if (!entry.isAbsent && entry.marksObtained === undefined) {
        throw new BadRequestException(
          `${entry.studentId}: marks are required unless the student is marked absent.`,
        );
      }
      if (
        entry.marksObtained !== undefined &&
        entry.marksObtained > examSubject.maxMarks
      ) {
        throw new BadRequestException(
          `${entry.studentId}: marks cannot exceed the maximum of ${examSubject.maxMarks}.`,
        );
      }
    }

    return this.unitOfWork.run(async (client) => {
      for (const entry of dto.entries) {
        await this.marksRepo.upsertMark(
          {
            examSubjectId,
            studentId: entry.studentId,
            marksObtained: entry.marksObtained ?? null,
            isAbsent: entry.isAbsent ?? false,
            enteredBy: personId,
          },
          client,
        );
      }
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'MARKS_SAVED',
          objectType: 'exam_subject',
          objectId: examSubjectId,
          outcome: 'SUCCESS',
          afterData: { entryCount: dto.entries.length },
        },
        client,
      );
      return { saved: dto.entries.length };
    });
  }

  async publish(personId: string, examSubjectId: string) {
    const examSubject = await this.assertOwnsExamSubject(
      personId,
      examSubjectId,
    );
    return this.unitOfWork.run(async (client) => {
      const count = await this.marksRepo.publishMarks(examSubjectId, client);
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'MARKS_PUBLISHED',
          objectType: 'exam_subject',
          objectId: examSubjectId,
          outcome: 'SUCCESS',
          afterData: { examName: examSubject.examName, publishedCount: count },
        },
        client,
      );
      return { published: count };
    });
  }
}
