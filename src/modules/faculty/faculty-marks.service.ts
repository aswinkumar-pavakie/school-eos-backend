// Marks Entry -- a subject teacher's own exam_subject rows, scoped strictly to
// subject_offerings they actually teach (never another teacher's class, and
// never a subject they don't teach even within their own advisor section).
// Real draft (mark.state='ENTERED') vs published (mark.state='PUBLISHED')
// lifecycle, exactly as already modeled at the DB level -- entry itself is
// only ever allowed while the parent exam is in its own real 'MARKS_ENTRY'
// state, AND (see save()'s own window check) within the real
// exam.marks_entry_opens_at/closes_at window an Academic Coordinator sets
// (faculty-academic-coordinator.service.ts's own setMarksEntryWindow) --
// once that window closes, save() rejects new entries even if the exam is
// still sitting in MARKS_ENTRY state, matching how a real school's marks
// entry period actually closes on a schedule, not just on a manual state
// change.

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
import { CorrectMarkDto } from './dto/correct-mark.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { MarksRepository } from './repositories/marks.repository';
import { MarkCorrectionRepository } from './repositories/mark-correction.repository';
import { ExamVerificationRepository } from './repositories/exam-verification.repository';

@Injectable()
export class FacultyMarksService {
  constructor(
    private readonly marksRepo: MarksRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
    private readonly markCorrectionRepo: MarkCorrectionRepository,
    private readonly examVerificationRepo: ExamVerificationRepository,
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
    const now = new Date();
    if (
      examSubject.marksEntryOpensAt &&
      now < new Date(examSubject.marksEntryOpensAt)
    ) {
      throw new ConflictException(
        `Marks entry for "${examSubject.examName}" opens on ${new Date(examSubject.marksEntryOpensAt).toLocaleDateString()}.`,
      );
    }
    if (
      examSubject.marksEntryClosesAt &&
      now > new Date(examSubject.marksEntryClosesAt)
    ) {
      throw new ConflictException(
        `Marks entry for "${examSubject.examName}" closed on ${new Date(examSubject.marksEntryClosesAt).toLocaleDateString()}. Contact your Academic Coordinator if you need it reopened.`,
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

  // ============================================================
  // Correction requests -- the real "sent back -> re-mark -> republish ->
  // reaches the coordinator again as a fresh request" loop. An Academic
  // Coordinator's "Send back" (faculty-academic-coordinator.service.ts's
  // own sendBackMarksSubmission) only ever writes to the additive
  // exam_verification table -- it never touches `mark`/`exam_subject`
  // itself, so this teacher's own subject(s) for that section+exam show up
  // here exactly as they are, however the coordinator's decision reads.
  // ============================================================

  /** Every real SENT_BACK submission that actually involves a subject this
   * teacher owns -- never a school-wide list, never someone else's class. */
  async listSentBackSubmissions(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    const sentBack = await this.examVerificationRepo.findAllSentBack();
    const rows = await Promise.all(
      sentBack.map(async (sb) => {
        const mySubjects =
          await this.marksRepo.findOwnedExamSubjectsForSectionExam(
            sb.sectionId,
            sb.examId,
            staffId,
          );
        if (mySubjects.length === 0) return null;
        const section = await this.marksRepo.findSectionLabel(sb.sectionId);
        return {
          sectionId: sb.sectionId,
          examId: sb.examId,
          examName: mySubjects[0].examName,
          gradeName: section?.gradeName ?? null,
          sectionName: section?.sectionName ?? null,
          comment: sb.comment,
          decidedAt: sb.decidedAt,
          subjects: mySubjects.map((s) => ({
            examSubjectId: s.examSubjectId,
            maxMarks: s.maxMarks,
          })),
        };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  /** Real correction onto a PUBLISHED mark -- see marks.repository.ts's own
   * header note on why this can never be a plain UPDATE
   * (guard_published_mark, a real DB trigger, rejects that outright). Only
   * ever usable against a subject this teacher genuinely owns; the mark
   * must already exist (a student who was never marked has nothing to
   * correct -- that's still a fresh entry via save(), not a correction).
   * Once recorded, flips the coordinator's own decision back to PENDING so
   * the exact same submission re-enters their review queue -- this is the
   * "reaches them again as a request" step, not a silent write. */
  async correctMark(
    personId: string,
    examSubjectId: string,
    dto: CorrectMarkDto,
  ) {
    const examSubject = await this.assertOwnsExamSubject(
      personId,
      examSubjectId,
    );
    const mark = await this.markCorrectionRepo.findMarkId(
      examSubjectId,
      dto.studentId,
    );
    if (!mark) {
      throw new NotFoundException(
        'No existing mark for this student -- nothing to correct.',
      );
    }
    if (dto.newMarksObtained > examSubject.maxMarks) {
      throw new BadRequestException(
        `Marks cannot exceed the maximum of ${examSubject.maxMarks}.`,
      );
    }
    // Once the Academic Coordinator has VERIFIED this section+exam, the
    // marks are locked for good -- only a fresh SENT_BACK re-opens
    // correction. Re-checked fresh on every call, never trusted from
    // anything cached.
    const decision = await this.examVerificationRepo.findOne(
      examSubject.sectionId,
      examSubject.examId,
    );
    if (decision?.status === 'VERIFIED') {
      throw new ConflictException(
        'This exam has already been verified by the Academic Coordinator and its marks are locked.',
      );
    }

    return this.unitOfWork.run(async (client) => {
      const correction = await this.markCorrectionRepo.create(
        {
          markId: mark.id,
          oldMarks: mark.marksObtained,
          newMarks: dto.newMarksObtained,
          reason: dto.reason,
          correctedBy: personId,
        },
        client,
      );
      await this.examVerificationRepo.resetToPendingIfSentBack(
        examSubject.sectionId,
        examSubject.examId,
        client,
      );
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'MARK_CORRECTED',
          objectType: 'mark',
          objectId: mark.id,
          outcome: 'SUCCESS',
          beforeData: { marksObtained: mark.marksObtained },
          afterData: correction,
        },
        client,
      );
      return correction;
    });
  }
}
