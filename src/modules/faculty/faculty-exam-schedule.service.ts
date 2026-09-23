import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { ExamRepository } from '../examinations/repositories/exam.repository';
import { FacultyExamsRepository } from './repositories/faculty-exams.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { MarksRepository } from './repositories/marks.repository';

// Real per-subject exam schedule (date/time/room), scoped down to this
// teacher's own classes. The underlying data (exam_subject) already exists
// and is already exposed to ADMIN/VICE_PRINCIPAL via the unscoped
// GET /examinations/:id/schedules (examinations/exams.controller.ts) -- this
// reuses the exact same ExamRepository.findSchedulesByExamId, never a new
// query or column, just filtered to rows the caller is actually allowed to
// see: their advised section(s) (any subject -- the class-advisor "Exam"
// screen) unioned with the subject offerings they actually teach (the
// "Exams" screen under MY SUBJECTS). exam_subject itself has no per-row
// FACULTY-ownership column, so this filter -- not a WHERE clause -- is the
// authorization boundary, the same shape every other Faculty feature already
// enforces via FacultyScopeRepository.
@Injectable()
export class FacultyExamScheduleService {
  constructor(
    private readonly examRepo: ExamRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly examsRepo: FacultyExamsRepository,
    private readonly marksRepo: MarksRepository,
    private readonly postgres: PostgresService,
  ) {}

  async getScheduleForActor(personId: string, examId: string) {
    const [sections, offerings, rows] = await Promise.all([
      this.scopeRepo.getAdvisorSections(personId),
      this.scopeRepo.getTeachingOfferings(personId),
      this.examRepo.findSchedulesByExamId(examId),
    ]);
    const advisedLabels = new Set(
      sections.map((s) => `${s.gradeName}-${s.sectionName}`),
    );
    const taughtOfferingIds = new Set(
      offerings.map((o) => o.subjectOfferingId),
    );
    return rows.filter(
      (r) =>
        advisedLabels.has(`${r.gradeName}-${r.sectionName}`) ||
        taughtOfferingIds.has(r.subjectOfferingId),
    );
  }

  /** Every PUBLISHED exam×subject this person is scoped to see, via either
   * path -- teaching offerings (Faculty's own "subjects I teach" Exams
   * view) or advisor sections (Class Teacher's own class-wide Exams view,
   * every subject, not just ones they personally teach), deduplicated by
   * (examId, subjectOfferingId). The client buckets Upcoming/Finished off
   * each row's own real examDate -- nothing server-side decides "now". */
  async listExamSubjects(personId: string) {
    const [sections, offerings] = await Promise.all([
      this.scopeRepo.getAdvisorSections(personId),
      this.scopeRepo.getTeachingOfferings(personId),
    ]);
    const [bySection, byOffering] = await Promise.all([
      this.examsRepo.findExamSubjectsForSections(sections.map((s) => s.sectionId)),
      this.examsRepo.findExamSubjectsForOfferings(offerings.map((o) => o.subjectOfferingId)),
    ]);
    const byKey = new Map<string, (typeof bySection)[number]>();
    for (const row of [...bySection, ...byOffering]) {
      byKey.set(`${row.examId}:${row.subjectOfferingId}`, row);
    }
    return [...byKey.values()];
  }

  /** Student-wise marks for one exam×subject -- authorized if the caller
   * either teaches this exact offering OR is the class advisor of its
   * section (a Class Teacher viewing a subject they don't personally
   * teach). Same published-marks shape faculty-subject-records.service.ts
   * already returns, just with the exam-ownership check widened to cover
   * the advisor path too. */
  async getMarksForExamSubject(personId: string, subjectOfferingId: string, examId: string) {
    const { rows: offeringRows } = await this.postgres.query<{ section_id: string }>(
      `SELECT section_id FROM subject_offering WHERE id = $1`,
      [subjectOfferingId],
    );
    const sectionId = offeringRows[0]?.section_id;
    if (!sectionId) throw new NotFoundException('This subject offering no longer exists.');

    const [owns, isAdvisor] = await Promise.all([
      this.scopeRepo.ownsOffering(personId, subjectOfferingId),
      this.scopeRepo.isAdvisorForSection(personId, sectionId),
    ]);
    if (!owns && !isAdvisor) {
      throw new ForbiddenException('You do not have access to this class or subject.');
    }

    const rows = await this.marksRepo.findPublishedMarksForOffering(sectionId, subjectOfferingId);
    // One row per (student, exam) -- CROSS JOIN exam_subject inside that
    // query means every exam scheduled for this offering shows up per
    // student, so narrowing to the one requested exam is exactly this filter.
    const forThisExam = rows.filter((r: any) => r.exam_id === examId);

    const byStudent = new Map<string, any>();
    for (const row of forThisExam) {
      let entry = byStudent.get(row.student_id);
      if (!entry) {
        entry = {
          studentId: row.student_id,
          studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
          rollNo: row.roll_no,
          marksObtained: null as number | null,
          maxMarks: null as number | null,
          isAbsent: false,
        };
        byStudent.set(row.student_id, entry);
      }
      if (row.exam_id === examId) {
        entry.marksObtained = row.marks_obtained === null ? null : Number(row.marks_obtained);
        entry.maxMarks = Number(row.max_marks);
        entry.isAbsent = row.is_absent ?? false;
      }
    }

    const students = [...byStudent.values()].sort((a, b) => (a.rollNo ?? 999) - (b.rollNo ?? 999));
    return { students };
  }
}
