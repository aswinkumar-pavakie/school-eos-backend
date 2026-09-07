import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface ExamRow {
  id: string;
  academicYearId: string;
  academicYearName: string;
  name: string;
  examType: string;
  term: string | null;
  gradeScaleId: string | null;
  gradeScaleName: string | null;
  marksEntryOpensAt: Date | null;
  marksEntryClosesAt: Date | null;
  state: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamScheduleRow {
  id: string;
  examId: string;
  subjectOfferingId: string;
  gradeName: string;
  sectionName: string;
  subjectName: string;
  teacherFirstName: string | null;
  teacherLastName: string | null;
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

export interface CreateExamInput {
  name: string;
  examType: string;
  academicYearId: string;
  term?: string | null;
  gradeScaleId?: string | null;
  marksEntryOpensAt?: string | null;
  marksEntryClosesAt?: string | null;
}

export interface UpdateExamInput {
  name?: string;
  examType?: string;
  term?: string | null;
  gradeScaleId?: string | null;
  marksEntryOpensAt?: string | null;
  marksEntryClosesAt?: string | null;
}

export interface CreateExamScheduleInput {
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
}

export interface UpdateExamScheduleInput {
  examDate?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  room?: string | null;
  maxMarks?: number;
  passMarks?: number | null;
  hasPractical?: boolean;
  practicalMax?: number | null;
  internalMax?: number | null;
}

const EXAM_COLUMNS = `e.id, e.academic_year_id AS "academicYearId", ay.name AS "academicYearName",
  e.name, e.exam_type AS "examType", e.term, e.grade_scale_id AS "gradeScaleId", gs.name AS "gradeScaleName",
  e.marks_entry_opens_at AS "marksEntryOpensAt", e.marks_entry_closes_at AS "marksEntryClosesAt",
  e.state, e.published_at AS "publishedAt", e.published_by AS "publishedBy",
  e.created_at AS "createdAt", e.updated_at AS "updatedAt"`;

const EXAM_FROM = `exam e
  JOIN academic_year ay ON ay.id = e.academic_year_id
  LEFT JOIN grade_scale gs ON gs.id = e.grade_scale_id`;

const SCHEDULE_COLUMNS = `es.id, es.exam_id AS "examId", es.subject_offering_id AS "subjectOfferingId",
  g.name AS "gradeName", sec.name AS "sectionName", sub.name AS "subjectName",
  p.first_name AS "teacherFirstName", p.last_name AS "teacherLastName",
  es.exam_date AS "examDate", es.start_time AS "startTime", es.duration_minutes AS "durationMinutes",
  es.room, es.max_marks AS "maxMarks", es.pass_marks AS "passMarks",
  es.has_practical AS "hasPractical", es.practical_max AS "practicalMax", es.internal_max AS "internalMax"`;

const SCHEDULE_FROM = `exam_subject es
  JOIN subject_offering so ON so.id = es.subject_offering_id
  JOIN section sec ON sec.id = so.section_id
  JOIN grade g ON g.id = sec.grade_id
  JOIN subject sub ON sub.id = so.subject_id
  LEFT JOIN staff st ON st.id = so.teacher_staff_id
  LEFT JOIN person p ON p.id = st.person_id`;

@Injectable()
export class ExamRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: { academicYearId?: string; state?: string },
    executor: Queryable = this.postgres,
  ): Promise<ExamRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`e.academic_year_id = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`e.state = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<ExamRow>(
      `SELECT ${EXAM_COLUMNS} FROM ${EXAM_FROM} ${where} ORDER BY e.created_at DESC`,
      params,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<ExamRow | null> {
    const { rows } = await executor.query<ExamRow>(`SELECT ${EXAM_COLUMNS} FROM ${EXAM_FROM} WHERE e.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async create(input: CreateExamInput, executor: Queryable = this.postgres): Promise<ExamRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO exam (academic_year_id, name, exam_type, term, grade_scale_id, marks_entry_opens_at, marks_entry_closes_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.academicYearId,
        input.name,
        input.examType,
        input.term ?? null,
        input.gradeScaleId ?? null,
        input.marksEntryOpensAt ?? null,
        input.marksEntryClosesAt ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(id: string, input: UpdateExamInput, executor: Queryable = this.postgres): Promise<ExamRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE exam SET
         name = COALESCE($2, name),
         exam_type = COALESCE($3, exam_type),
         term = COALESCE($4, term),
         grade_scale_id = COALESCE($5, grade_scale_id),
         marks_entry_opens_at = COALESCE($6, marks_entry_opens_at),
         marks_entry_closes_at = COALESCE($7, marks_entry_closes_at),
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.name ?? null,
        input.examType ?? null,
        input.term ?? null,
        input.gradeScaleId ?? null,
        input.marksEntryOpensAt ?? null,
        input.marksEntryClosesAt ?? null,
      ],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }

  async publish(
    id: string,
    publishedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<ExamRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE exam SET state = 'PUBLISHED', published_at = now(), published_by = $2, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id, publishedBy],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }

  async lock(id: string, executor: Queryable = this.postgres): Promise<ExamRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE exam SET state = 'LOCKED', updated_at = now() WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }

  async findSchedulesByExamId(examId: string, executor: Queryable = this.postgres): Promise<ExamScheduleRow[]> {
    const { rows } = await executor.query<ExamScheduleRow>(
      `SELECT ${SCHEDULE_COLUMNS} FROM ${SCHEDULE_FROM} WHERE es.exam_id = $1 ORDER BY es.exam_date NULLS LAST, g.level_no, sec.name, sub.name`,
      [examId],
    );
    return rows;
  }

  async findScheduleById(id: string, executor: Queryable = this.postgres): Promise<ExamScheduleRow | null> {
    const { rows } = await executor.query<ExamScheduleRow>(
      `SELECT ${SCHEDULE_COLUMNS} FROM ${SCHEDULE_FROM} WHERE es.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async createSchedule(
    examId: string,
    input: CreateExamScheduleInput,
    executor: Queryable = this.postgres,
  ): Promise<ExamScheduleRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO exam_subject
         (exam_id, subject_offering_id, exam_date, start_time, duration_minutes, room,
          max_marks, pass_marks, has_practical, practical_max, internal_max)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, false), $10, $11)
       RETURNING id`,
      [
        examId,
        input.subjectOfferingId,
        input.examDate ?? null,
        input.startTime ?? null,
        input.durationMinutes ?? null,
        input.room ?? null,
        input.maxMarks,
        input.passMarks ?? null,
        input.hasPractical ?? null,
        input.practicalMax ?? null,
        input.internalMax ?? null,
      ],
    );
    return (await this.findScheduleById(rows[0].id, executor))!;
  }

  async updateSchedule(
    id: string,
    input: UpdateExamScheduleInput,
    executor: Queryable = this.postgres,
  ): Promise<ExamScheduleRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE exam_subject SET
         exam_date = COALESCE($2, exam_date),
         start_time = COALESCE($3, start_time),
         duration_minutes = COALESCE($4, duration_minutes),
         room = COALESCE($5, room),
         max_marks = COALESCE($6, max_marks),
         pass_marks = COALESCE($7, pass_marks),
         has_practical = COALESCE($8, has_practical),
         practical_max = COALESCE($9, practical_max),
         internal_max = COALESCE($10, internal_max)
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.examDate ?? null,
        input.startTime ?? null,
        input.durationMinutes ?? null,
        input.room ?? null,
        input.maxMarks ?? null,
        input.passMarks ?? null,
        input.hasPractical ?? null,
        input.practicalMax ?? null,
        input.internalMax ?? null,
      ],
    );
    if (!rows[0]) return null;
    return this.findScheduleById(id, executor);
  }
}
