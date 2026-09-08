import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface RouteRow {
  id: string;
  name: string;
  code: string | null;
  direction: string;
  distanceKm: string | null;
  status: string;
}

export interface CreateRouteInput {
  name: string;
  code?: string | null;
  direction?: string;
  distanceKm?: number | null;
  status?: string;
}

export interface UpdateRouteInput {
  name?: string;
  code?: string | null;
  direction?: string;
  distanceKm?: number | null;
  status?: string;
}

const COLUMNS = `id, name, code, direction, distance_km AS "distanceKm", status`;

@Injectable()
export class RouteRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<RouteRow[]> {
    const { rows } = await executor.query<RouteRow>(`SELECT ${COLUMNS} FROM route ORDER BY name`);
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<RouteRow | null> {
    const { rows } = await executor.query<RouteRow>(`SELECT ${COLUMNS} FROM route WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateRouteInput, executor: Queryable = this.postgres): Promise<RouteRow> {
    const { rows } = await executor.query<RouteRow>(
      `INSERT INTO route (name, code, direction, distance_km, status)
       VALUES ($1, $2, COALESCE($3, 'BOTH'), $4, COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.code ?? null,
        input.direction ?? null,
        input.distanceKm ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateRouteInput,
    executor: Queryable = this.postgres,
  ): Promise<RouteRow | null> {
    const { rows } = await executor.query<RouteRow>(
      `UPDATE route SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         direction = COALESCE($4, direction),
         distance_km = COALESCE($5, distance_km),
         status = COALESCE($6, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.code ?? null,
        input.direction ?? null,
        input.distanceKm ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
