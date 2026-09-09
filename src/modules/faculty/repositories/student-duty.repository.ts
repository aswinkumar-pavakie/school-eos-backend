// student_duty_assignment -- greenfield table (migration 0008), the "class
// leader / class officer" feature. No precedent anywhere else in the schema;
// scoped strictly to the class advisor's own section, current academic year.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentDutyRow {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: number | null;
  title: string;
  duties: string | null;
  status: string;
  createdAt: Date;
}

function mapRow(row: any): StudentDutyRow {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    rollNo: row.roll_no,
    title: row.title,
    duties: row.duties,
    status: row.status,
    createdAt: row.created_at,
  };
}

const COLUMNS = `sda.id, sda.student_id, sda.title, sda.duties, sda.status, sda.created_at,
  p.first_name, p.last_name, se.roll_no`;

const FROM = `
  FROM student_duty_assignment sda
  JOIN student s ON s.id = sda.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = sda.student_id AND se.section_id = sda.section_id AND se.status = 'ACTIVE'`;

@Injectable()
export class StudentDutyRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Search box for "assign a class leader" -- name/roll match within this
   * one section only, current academic year. */
  async searchStudents(
    sectionId: string,
    query: string,
    executor: Queryable = this.postgres,
  ): Promise<
    { studentId: string; studentName: string; rollNo: number | null }[]
  > {
    const { rows } = await executor.query(
      `SELECT s.id AS student_id, p.first_name, p.last_name, se.roll_no
       FROM student_enrolment se
       JOIN student s ON s.id = se.student_id
       JOIN person p ON p.id = s.person_id
       WHERE se.section_id = $1 AND se.status = 'ACTIVE'
         AND (p.first_name || ' ' || COALESCE(p.last_name, '')) ILIKE $2
       ORDER BY se.roll_no NULLS LAST, p.first_name
       LIMIT 20`,
      [sectionId, `%${query}%`],
    );
    return rows.map((row: any) => ({
      studentId: row.student_id,
      studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
      rollNo: row.roll_no,
    }));
  }

  /** Every ACTIVE duty assignment in this section, current academic year --
   * the "CLASS OFFICERS" list at the bottom of the dashboard. */
  async findActiveForSection(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentDutyRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE sda.section_id = $1 AND sda.status = 'ACTIVE'
         AND sda.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       ORDER BY sda.created_at`,
      [sectionId],
    );
    return rows.map(mapRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<(StudentDutyRow & { sectionId: string }) | null> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS}, sda.section_id ${FROM} WHERE sda.id = $1`,
      [id],
    );
    if (!rows.length) return null;
    return { ...mapRow(rows[0]), sectionId: rows[0].section_id };
  }

  async create(
    input: {
      studentId: string;
      sectionId: string;
      title: string;
      duties: string | null;
      assignedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO student_duty_assignment (student_id, section_id, academic_year_id, title, duties, status, assigned_by)
       VALUES ($1, $2, (SELECT id FROM academic_year WHERE is_current LIMIT 1), $3, $4, 'ACTIVE', $5)
       RETURNING id`,
      [
        input.studentId,
        input.sectionId,
        input.title,
        input.duties,
        input.assignedBy,
      ],
    );
    return rows[0].id;
  }

  async update(
    id: string,
    input: Partial<{ title: string; duties: string | null; status: string }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) push('title', input.title);
    if (input.duties !== undefined) push('duties', input.duties);
    if (input.status !== undefined) push('status', input.status);
    if (sets.length === 0) return;
    params.push(id);
    await executor.query(
      `UPDATE student_duty_assignment SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM student_duty_assignment WHERE id = $1`, [
      id,
    ]);
  }
}
