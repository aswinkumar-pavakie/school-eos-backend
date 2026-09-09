// The event itself (name, location, purpose, time window, monitoring teacher).
// monitoring_teacher_person_id is a real FK to person -- "their details" are
// joined from staff/person at read time here, never duplicated into this row.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentEventRow {
  id: string;
  name: string;
  location: string;
  purpose: string;
  startsAt: Date;
  endsAt: Date;
  monitoringTeacherPersonId: string;
  monitoringTeacherName: string;
  monitoringTeacherDesignation: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): StudentEventRow {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    purpose: row.purpose,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    monitoringTeacherPersonId: row.monitoring_teacher_person_id,
    monitoringTeacherName: [row.teacher_first_name, row.teacher_last_name]
      .filter(Boolean)
      .join(' '),
    monitoringTeacherDesignation: row.teacher_designation,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `
  se.id, se.name, se.location, se.purpose, se.starts_at, se.ends_at,
  se.monitoring_teacher_person_id, se.created_by, se.created_at, se.updated_at,
  tp.first_name AS teacher_first_name, tp.last_name AS teacher_last_name, st.designation AS teacher_designation`;

const FROM = `
  FROM student_event se
  JOIN person tp ON tp.id = se.monitoring_teacher_person_id
  LEFT JOIN staff st ON st.person_id = tp.id`;

@Injectable()
export class StudentEventRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      name: string;
      location: string;
      purpose: string;
      startsAt: string;
      endsAt: string;
      monitoringTeacherPersonId: string;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<StudentEventRow> {
    const { rows } = await executor.query(
      `INSERT INTO student_event (name, location, purpose, starts_at, ends_at, monitoring_teacher_person_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.name,
        input.location,
        input.purpose,
        input.startsAt,
        input.endsAt,
        input.monitoringTeacherPersonId,
        input.createdBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  /** Every event created by this exact faculty member -- own-events-only, the
   * real authorization boundary every :id route re-checks before acting. */
  async findByCreator(
    createdBy: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentEventRow[]> {
    const { rows } = await executor.query(
      `${`SELECT ${COLUMNS}`} ${FROM} WHERE se.created_by = $1 ORDER BY se.starts_at DESC`,
      [createdBy],
    );
    return rows.map(mapRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentEventRow | null> {
    const { rows } = await executor.query(
      `${`SELECT ${COLUMNS}`} ${FROM} WHERE se.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<{ id: string; createdBy: string } | null> {
    const { rows } = await executor.query(
      `SELECT id, created_by AS "createdBy" FROM student_event WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM student_event WHERE id = $1`, [id]);
  }
}
