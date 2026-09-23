// Exams -- real per-(exam, subject) rows for the sections a Faculty member
// is scoped to (teaching offerings ∪ advisor sections -- same union
// FacultyExamScheduleService.getScheduleForActor already uses for one
// specific exam; this lists every PUBLISHED exam×subject at once, with its
// real exam_date, so the client can bucket Upcoming vs Finished itself
// rather than the server guessing "now"). Reuses the exact same
// exam_subject/subject_offering/exam/section/grade join shape ExamRepository
// already uses elsewhere -- a separate file, not a widened shared query,
// so ADMIN/VP's own unscoped exam-schedule reads stay untouched.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FacultyExamSubjectRow {
  examId: string;
  examName: string;
  examType: string;
  term: string | null;
  subjectOfferingId: string;
  subjectName: string;
  sectionId: string;
  gradeName: string;
  sectionName: string;
  examDate: string | null;
  startTime: string | null;
}

@Injectable()
export class FacultyExamsRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every PUBLISHED exam×subject scheduled for any of these sections --
   * used for a Class Teacher's own advisor section(s), regardless of which
   * subject they personally teach there. */
  async findExamSubjectsForSections(
    sectionIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<FacultyExamSubjectRow[]> {
    if (sectionIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT e.id AS exam_id, e.name AS exam_name, e.exam_type, e.term,
              so.id AS subject_offering_id, subj.name AS subject_name,
              sec.id AS section_id, g.name AS grade_name, sec.name AS section_name,
              es.exam_date, es.start_time
       FROM exam_subject es
       JOIN exam e ON e.id = es.exam_id AND e.state = 'PUBLISHED'
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN subject subj ON subj.id = so.subject_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE so.section_id = ANY($1::uuid[])
       ORDER BY es.exam_date NULLS LAST, subj.name`,
      [sectionIds],
    );
    return rows.map((row: any) => ({
      examId: row.exam_id,
      examName: row.exam_name,
      examType: row.exam_type,
      term: row.term,
      subjectOfferingId: row.subject_offering_id,
      subjectName: row.subject_name,
      sectionId: row.section_id,
      gradeName: row.grade_name,
      sectionName: row.section_name,
      examDate: row.exam_date,
      startTime: row.start_time,
    }));
  }

  /** Every PUBLISHED exam×subject for these subject_offering ids -- used
   * for Faculty's own "subjects I teach" Exams view. */
  async findExamSubjectsForOfferings(
    subjectOfferingIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<FacultyExamSubjectRow[]> {
    if (subjectOfferingIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT e.id AS exam_id, e.name AS exam_name, e.exam_type, e.term,
              so.id AS subject_offering_id, subj.name AS subject_name,
              sec.id AS section_id, g.name AS grade_name, sec.name AS section_name,
              es.exam_date, es.start_time
       FROM exam_subject es
       JOIN exam e ON e.id = es.exam_id AND e.state = 'PUBLISHED'
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN subject subj ON subj.id = so.subject_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE so.id = ANY($1::uuid[])
       ORDER BY es.exam_date NULLS LAST, subj.name`,
      [subjectOfferingIds],
    );
    return rows.map((row: any) => ({
      examId: row.exam_id,
      examName: row.exam_name,
      examType: row.exam_type,
      term: row.term,
      subjectOfferingId: row.subject_offering_id,
      subjectName: row.subject_name,
      sectionId: row.section_id,
      gradeName: row.grade_name,
      sectionName: row.section_name,
      examDate: row.exam_date,
      startTime: row.start_time,
    }));
  }
}
