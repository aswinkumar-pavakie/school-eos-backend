import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface SubjectOfferingRow {
  id: string;
  academicYearId: string;
  sectionId: string;
  gradeName: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  teacherStaffId: string | null;
  teacherFirstName: string | null;
  teacherLastName: string | null;
  isPractical: boolean;
  weeklyPeriods: number;
  status: string;
}

const COLUMNS = `so.id, so.academic_year_id AS "academicYearId", so.section_id AS "sectionId",
  g.name AS "gradeName", sec.name AS "sectionName",
  so.subject_id AS "subjectId", sub.name AS "subjectName",
  so.teacher_staff_id AS "teacherStaffId", p.first_name AS "teacherFirstName", p.last_name AS "teacherLastName",
  so.is_practical AS "isPractical", so.weekly_periods AS "weeklyPeriods", so.status`;

const FROM = `subject_offering so
  JOIN section sec ON sec.id = so.section_id
  JOIN grade g ON g.id = sec.grade_id
  JOIN subject sub ON sub.id = so.subject_id
  LEFT JOIN staff st ON st.id = so.teacher_staff_id
  LEFT JOIN person p ON p.id = st.person_id`;

@Injectable()
export class SubjectOfferingRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findBySection(sectionId: string, executor: Queryable = this.postgres): Promise<SubjectOfferingRow[]> {
    const { rows } = await executor.query<SubjectOfferingRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE so.section_id = $1 ORDER BY sub.name`,
      [sectionId],
    );
    return rows;
  }

  /** Every subject_offering a given staff member currently teaches, across every
   * section -- "which subjects is this faculty handling" needs the reverse
   * direction from findBySection. */
  async findByTeacher(teacherStaffId: string, executor: Queryable = this.postgres): Promise<SubjectOfferingRow[]> {
    const { rows } = await executor.query<SubjectOfferingRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE so.teacher_staff_id = $1 ORDER BY g.name, sec.name, sub.name`,
      [teacherStaffId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<SubjectOfferingRow | null> {
    const { rows } = await executor.query<SubjectOfferingRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE so.id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async updateTeacher(
    id: string,
    teacherStaffId: string,
    executor: Queryable = this.postgres,
  ): Promise<SubjectOfferingRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE subject_offering SET teacher_staff_id = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, teacherStaffId],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }
}
