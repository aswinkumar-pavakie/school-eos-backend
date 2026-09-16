import { Injectable } from '@nestjs/common';
import { ExamRepository } from '../examinations/repositories/exam.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

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
}
