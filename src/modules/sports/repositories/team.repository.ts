import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TeamRow {
  id: string;
  sportId: string;
  sportName: string;
  sportCategoryId: string | null;
  academicYearId: string;
  name: string;
  coachId: string | null;
  captainStudentId: string | null;
  houseId: string | null;
  status: string;
}

export interface CreateTeamInput {
  sportId: string;
  sportCategoryId?: string | null;
  academicYearId: string;
  name: string;
  coachId?: string | null;
  captainStudentId?: string | null;
  houseId?: string | null;
}

const COLUMNS = `t.id, t.sport_id AS "sportId", sp.name AS "sportName", t.sport_category_id AS "sportCategoryId",
  t.academic_year_id AS "academicYearId", t.name, t.coach_id AS "coachId",
  t.captain_student_id AS "captainStudentId", t.house_id AS "houseId", t.status`;

const FROM = `FROM team t JOIN sport sp ON sp.id = t.sport_id`;

@Injectable()
export class TeamRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreateTeamInput,
    executor: Queryable = this.postgres,
  ): Promise<TeamRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO team (sport_id, sport_category_id, academic_year_id, name, coach_id, captain_student_id, house_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.sportId,
        input.sportCategoryId ?? null,
        input.academicYearId,
        input.name,
        input.coachId ?? null,
        input.captainStudentId ?? null,
        input.houseId ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<TeamRow | null> {
    const { rows } = await executor.query<TeamRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE t.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Every team under any sport this Faculty member is currently authorized
   * for — never a school-wide list. */
  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<TeamRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<TeamRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE t.sport_id = ANY($1::uuid[]) ORDER BY t.name`,
      [sportIds],
    );
    return rows;
  }

  /** Feature #16 — assign/reassign a coach to a team. coach.id must be a real
   * row (FK-enforced); the service layer checks it's a coach this Faculty
   * member is otherwise allowed to reference (no separate scope on coach
   * itself — coach registration is Admin-only, see CoachesController). */
  async updateCoach(
    id: string,
    coachId: string,
    executor: Queryable = this.postgres,
  ): Promise<TeamRow | null> {
    await executor.query(`UPDATE team SET coach_id = $2 WHERE id = $1`, [
      id,
      coachId,
    ]);
    return this.findById(id, executor);
  }

  /** Core team fields (name/category/captain/house/status) -- COALESCE-based
   * partial update, same pattern as every other real update method in this
   * codebase. No delete route exists at all (rosters/fixtures/sessions
   * reference the team), so status='INACTIVE' via this method is the real
   * soft-delete path. */
  async update(
    id: string,
    input: { name?: string; sportCategoryId?: string; captainStudentId?: string; houseId?: string; status?: string },
    executor: Queryable = this.postgres,
  ): Promise<TeamRow | null> {
    await executor.query(
      `UPDATE team SET
         name = COALESCE($2, name),
         sport_category_id = COALESCE($3, sport_category_id),
         captain_student_id = COALESCE($4, captain_student_id),
         house_id = COALESCE($5, house_id),
         status = COALESCE($6, status)
       WHERE id = $1`,
      [id, input.name ?? null, input.sportCategoryId ?? null, input.captainStudentId ?? null, input.houseId ?? null, input.status ?? null],
    );
    return this.findById(id, executor);
  }
}
