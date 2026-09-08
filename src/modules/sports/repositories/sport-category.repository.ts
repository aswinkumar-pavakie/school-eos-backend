import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SportCategoryRow {
  id: string;
  sportId: string;
  name: string;
  ageGroup: string | null;
  gender: string | null;
}

export interface CreateSportCategoryInput {
  name: string;
  ageGroup?: string | null;
  gender?: string | null;
}

export interface UpdateSportCategoryInput {
  name?: string;
  ageGroup?: string | null;
  gender?: string | null;
}

const COLUMNS = `id, sport_id AS "sportId", name, age_group AS "ageGroup", gender`;

@Injectable()
export class SportCategoryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findBySportId(
    sportId: string,
    executor: Queryable = this.postgres,
  ): Promise<SportCategoryRow[]> {
    const { rows } = await executor.query<SportCategoryRow>(
      `SELECT ${COLUMNS} FROM sport_category WHERE sport_id = $1 ORDER BY name`,
      [sportId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SportCategoryRow | null> {
    const { rows } = await executor.query<SportCategoryRow>(
      `SELECT ${COLUMNS} FROM sport_category WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    sportId: string,
    input: CreateSportCategoryInput,
    executor: Queryable = this.postgres,
  ): Promise<SportCategoryRow> {
    const { rows } = await executor.query<SportCategoryRow>(
      `INSERT INTO sport_category (sport_id, name, age_group, gender)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [sportId, input.name, input.ageGroup ?? null, input.gender ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateSportCategoryInput,
    executor: Queryable = this.postgres,
  ): Promise<SportCategoryRow | null> {
    const { rows } = await executor.query<SportCategoryRow>(
      `UPDATE sport_category SET
         name = COALESCE($2, name),
         age_group = COALESCE($3, age_group),
         gender = COALESCE($4, gender)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.ageGroup ?? null, input.gender ?? null],
    );
    return rows[0] ?? null;
  }
}
