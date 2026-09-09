import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SportsProfileRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  sportId: string;
  sportCategoryId: string | null;
  joinedOn: string;
  positionOrRole: string | null;
  status: string;
}

const COLUMNS = `sp.id, sp.student_id AS "studentId", p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  sp.sport_id AS "sportId", sp.sport_category_id AS "sportCategoryId", sp.joined_on AS "joinedOn",
  sp.position_or_role AS "positionOrRole", sp.status`;

const FROM = `FROM sports_profile sp JOIN student s ON s.id = sp.student_id JOIN person p ON p.id = s.person_id`;

@Injectable()
export class SportsProfileRepository {
  constructor(private readonly postgres: PostgresService) {}

  async upsert(
    input: {
      studentId: string;
      sportId: string;
      sportCategoryId?: string | null;
      joinedOn?: string | null;
      positionOrRole?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<SportsProfileRow> {
    // ON CONFLICT (student_id, sport_id) -- re-joining the same sport
    // reactivates/updates the one real profile row rather than erroring, since
    // uq_sports_profile makes a second row for the same pair impossible anyway.
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sports_profile (student_id, sport_id, sport_category_id, joined_on, position_or_role)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
       ON CONFLICT (student_id, sport_id) DO UPDATE SET
         sport_category_id = EXCLUDED.sport_category_id,
         position_or_role = EXCLUDED.position_or_role,
         status = 'ACTIVE'
       RETURNING id`,
      [
        input.studentId,
        input.sportId,
        input.sportCategoryId ?? null,
        input.joinedOn ?? null,
        input.positionOrRole ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SportsProfileRow | null> {
    const { rows } = await executor.query<SportsProfileRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE sp.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<SportsProfileRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<SportsProfileRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE sp.sport_id = ANY($1::uuid[]) ORDER BY p.first_name, p.last_name`,
      [sportIds],
    );
    return rows;
  }

  async update(
    id: string,
    input: {
      sportCategoryId?: string | null;
      positionOrRole?: string | null;
      status?: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<SportsProfileRow | null> {
    await executor.query(
      `UPDATE sports_profile SET
         sport_category_id = COALESCE($2, sport_category_id),
         position_or_role = COALESCE($3, position_or_role),
         status = COALESCE($4, status)
       WHERE id = $1`,
      [
        id,
        input.sportCategoryId ?? null,
        input.positionOrRole ?? null,
        input.status ?? null,
      ],
    );
    return this.findById(id, executor);
  }
}
