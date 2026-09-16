import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AcademicCoordinatorLoginRow {
  coordinatorPersonId: string;
  facultyPersonId: string;
  createdAt: Date;
}

@Injectable()
export class AcademicCoordinatorLoginRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByFacultyPersonId(
    facultyPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<AcademicCoordinatorLoginRow | null> {
    const { rows } = await executor.query<{
      coordinator_person_id: string;
      faculty_person_id: string;
      created_at: Date;
    }>(
      `SELECT coordinator_person_id, faculty_person_id, created_at
       FROM academic_coordinator_login
       WHERE faculty_person_id = $1`,
      [facultyPersonId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      coordinatorPersonId: row.coordinator_person_id,
      facultyPersonId: row.faculty_person_id,
      createdAt: row.created_at,
    };
  }

  async create(
    input: { coordinatorPersonId: string; facultyPersonId: string; createdBy: string },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO academic_coordinator_login (coordinator_person_id, faculty_person_id, created_by)
       VALUES ($1, $2, $3)`,
      [input.coordinatorPersonId, input.facultyPersonId, input.createdBy],
    );
  }
}
