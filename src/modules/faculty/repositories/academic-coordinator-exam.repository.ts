// Academic Coordinator's exam configuration + marks-completion monitoring --
// reuses the real exam/exam_grade/exam_subject/mark tables Marks Entry and
// Subject Records already depend on. The Coordinator configures the exam
// structure and schedule (sections 14/15); actually entering marks stays the
// subject teacher's own job (faculty-marks.service.ts, untouched) -- this
// only ever reads `mark` to report completion, never writes to it.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CoordinatorExamRow {
  examId: string;
  name: string;
  examType: string;
  term: string | null;
  state: string;
  gradeNames: string[];
}

export interface CoordinatorExamSubjectRow {
  examSubjectId: string;
  examId: string;
  subjectOfferingId: string;
  subjectName: string;
  gradeName: string;
  sectionName: string;
  examDate: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  room: string | null;
  maxMarks: string;
  passMarks: string | null;
  hasPractical: boolean;
  practicalMax: string | null;
  internalMax: string | null;
}

export interface ExamReadinessRow extends CoordinatorExamSubjectRow {
  expectedCount: number;
  enteredCount: number;
  verifiedCount: number;
}

const FORWARD_TRANSITIONS: Record<string, string> = {
  DRAFT: 'SCHEDULED',
  SCHEDULED: 'CONDUCTED',
  CONDUCTED: 'MARKS_ENTRY',
};

@Injectable()
export class AcademicCoordinatorExamRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findExamsForGrades(gradeIds: string[], executor: Queryable = this.postgres): Promise<CoordinatorExamRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT e.id AS exam_id, e.name, e.exam_type, e.term, e.state, array_agg(DISTINCT g.name) AS grade_names
       FROM exam e
       JOIN exam_grade eg ON eg.exam_id = e.id
       JOIN grade g ON g.id = eg.grade_id
       WHERE eg.grade_id = ANY($1) AND e.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       GROUP BY e.id, e.name, e.exam_type, e.term, e.state
       ORDER BY e.created_at DESC`,
      [gradeIds],
    );
    return rows.map((r: any) => ({
      examId: r.exam_id,
      name: r.name,
      examType: r.exam_type,
      term: r.term,
      state: r.state,
      gradeNames: r.grade_names,
    }));
  }

  async findExamGradeIds(examId: string, executor: Queryable = this.postgres): Promise<string[]> {
    const { rows } = await executor.query(`SELECT grade_id FROM exam_grade WHERE exam_id = $1`, [examId]);
    return rows.map((r: any) => r.grade_id);
  }

  async createExam(
    input: { academicYearId: string; name: string; examType: string; term?: string | null; gradeIds: string[] },
  ): Promise<string> {
    const client = await this.postgres.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO exam (academic_year_id, name, exam_type, term) VALUES ($1, $2, $3, $4) RETURNING id`,
        [input.academicYearId, input.name, input.examType, input.term ?? null],
      );
      const examId = rows[0].id;
      for (const gradeId of input.gradeIds) {
        await client.query(`INSERT INTO exam_grade (exam_id, grade_id) VALUES ($1, $2)`, [examId, gradeId]);
      }
      await client.query('COMMIT');
      return examId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findExamById(examId: string, executor: Queryable = this.postgres): Promise<{ state: string } | null> {
    const { rows } = await executor.query(`SELECT state FROM exam WHERE id = $1`, [examId]);
    return rows[0] ?? null;
  }

  /** Forward-only, and capped at MARKS_ENTRY -- VERIFIED/PUBLISHED/LOCKED are
   * exam-office/Principal finalization steps, deliberately out of the
   * Coordinator's own remit (see spec section 24: Coordinator prepares,
   * Principal/exam-office finalizes). Returns the new state, or null if the
   * requested transition isn't a legal forward step from the current one. */
  async advanceExamState(examId: string, executor: Queryable = this.postgres): Promise<string | null> {
    const current = await this.findExamById(examId, executor);
    if (!current) return null;
    const next = FORWARD_TRANSITIONS[current.state];
    if (!next) return null;
    await executor.query(`UPDATE exam SET state = $2, updated_at = now() WHERE id = $1`, [examId, next]);
    return next;
  }

  async findExamSubjects(examId: string, gradeIds: string[], executor: Queryable = this.postgres): Promise<CoordinatorExamSubjectRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT es.id AS exam_subject_id, es.exam_id, es.subject_offering_id, subj.name AS subject_name,
              g.name AS grade_name, sec.name AS section_name, es.exam_date, es.start_time, es.duration_minutes,
              es.room, es.max_marks, es.pass_marks, es.has_practical, es.practical_max, es.internal_max
       FROM exam_subject es
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       JOIN subject subj ON subj.id = so.subject_id
       WHERE es.exam_id = $1 AND g.id = ANY($2)
       ORDER BY g.name, sec.name, subj.name`,
      [examId, gradeIds],
    );
    return rows.map(mapExamSubject);
  }

  async createExamSubject(
    input: {
      examId: string;
      subjectOfferingId: string;
      examDate?: string | null;
      startTime?: string | null;
      durationMinutes?: number | null;
      room?: string | null;
      maxMarks: number;
      passMarks?: number | null;
      hasPractical?: boolean;
      practicalMax?: number | null;
      internalMax?: number | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO exam_subject
         (exam_id, subject_offering_id, exam_date, start_time, duration_minutes, room, max_marks, pass_marks, has_practical, practical_max, internal_max)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        input.examId,
        input.subjectOfferingId,
        input.examDate ?? null,
        input.startTime ?? null,
        input.durationMinutes ?? null,
        input.room ?? null,
        input.maxMarks,
        input.passMarks ?? null,
        input.hasPractical ?? false,
        input.practicalMax ?? null,
        input.internalMax ?? null,
      ],
    );
    return rows[0].id;
  }

  async updateExamSubject(
    examSubjectId: string,
    input: Partial<{
      examDate: string; startTime: string; durationMinutes: number; room: string;
      maxMarks: number; passMarks: number; hasPractical: boolean; practicalMax: number; internalMax: number;
    }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [examSubjectId];
    const push = (col: string, val: unknown) => {
      if (val === undefined) return;
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    push('exam_date', input.examDate);
    push('start_time', input.startTime);
    push('duration_minutes', input.durationMinutes);
    push('room', input.room);
    push('max_marks', input.maxMarks);
    push('pass_marks', input.passMarks);
    push('has_practical', input.hasPractical);
    push('practical_max', input.practicalMax);
    push('internal_max', input.internalMax);
    if (sets.length === 0) return;
    await executor.query(`UPDATE exam_subject SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  async findExamSubjectOffering(examSubjectId: string, executor: Queryable = this.postgres): Promise<string | null> {
    const { rows } = await executor.query(`SELECT subject_offering_id FROM exam_subject WHERE id = $1`, [examSubjectId]);
    return rows[0]?.subject_offering_id ?? null;
  }

  async findReadiness(examId: string, gradeIds: string[], executor: Queryable = this.postgres): Promise<ExamReadinessRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT es.id AS exam_subject_id, es.exam_id, es.subject_offering_id, subj.name AS subject_name,
              g.name AS grade_name, sec.name AS section_name, es.exam_date, es.start_time, es.duration_minutes,
              es.room, es.max_marks, es.pass_marks, es.has_practical, es.practical_max, es.internal_max,
              (SELECT COUNT(*) FROM student_enrolment se WHERE se.section_id = sec.id AND se.status = 'ACTIVE') AS expected_count,
              (SELECT COUNT(*) FROM mark m WHERE m.exam_subject_id = es.id) AS entered_count,
              (SELECT COUNT(*) FROM mark m WHERE m.exam_subject_id = es.id AND m.state IN ('VERIFIED', 'PUBLISHED')) AS verified_count
       FROM exam_subject es
       JOIN subject_offering so ON so.id = es.subject_offering_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       JOIN subject subj ON subj.id = so.subject_id
       WHERE es.exam_id = $1 AND g.id = ANY($2)
       ORDER BY g.name, sec.name, subj.name`,
      [examId, gradeIds],
    );
    return rows.map((r: any) => ({
      ...mapExamSubject(r),
      expectedCount: Number(r.expected_count),
      enteredCount: Number(r.entered_count),
      verifiedCount: Number(r.verified_count),
    }));
  }
}

function mapExamSubject(r: any): CoordinatorExamSubjectRow {
  return {
    examSubjectId: r.exam_subject_id,
    examId: r.exam_id,
    subjectOfferingId: r.subject_offering_id,
    subjectName: r.subject_name,
    gradeName: r.grade_name,
    sectionName: r.section_name,
    examDate: r.exam_date,
    startTime: r.start_time,
    durationMinutes: r.duration_minutes,
    room: r.room,
    maxMarks: r.max_marks,
    passMarks: r.pass_marks,
    hasPractical: r.has_practical,
    practicalMax: r.practical_max,
    internalMax: r.internal_max,
  };
}
