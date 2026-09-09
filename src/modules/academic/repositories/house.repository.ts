// captain_student_id references `student`, owned by Phase 2 (People), not this module --
// same opaque-FK treatment as department.hod_staff_id.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HouseRow {
  id: string;
  name: string;
  colourHex: string | null;
  captainStudentId: string | null;
  status: string;
}

export interface CreateHouseInput {
  name: string;
  colourHex?: string | null;
  captainStudentId?: string | null;
  status?: string;
}

export interface UpdateHouseInput {
  name?: string;
  colourHex?: string | null;
  captainStudentId?: string | null;
  status?: string;
}

const COLUMNS = `id, name, colour_hex AS "colourHex", captain_student_id AS "captainStudentId", status`;

@Injectable()
export class HouseRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<HouseRow[]> {
    const { rows } = await executor.query<HouseRow>(
      `SELECT ${COLUMNS} FROM house ORDER BY name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HouseRow | null> {
    const { rows } = await executor.query<HouseRow>(
      `SELECT ${COLUMNS} FROM house WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateHouseInput,
    executor: Queryable = this.postgres,
  ): Promise<HouseRow> {
    const { rows } = await executor.query<HouseRow>(
      `INSERT INTO house (name, colour_hex, captain_student_id, status)
       VALUES ($1, $2, $3, COALESCE($4, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.colourHex ?? null,
        input.captainStudentId ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHouseInput,
    executor: Queryable = this.postgres,
  ): Promise<HouseRow | null> {
    const { rows } = await executor.query<HouseRow>(
      `UPDATE house SET
         name = COALESCE($2, name),
         colour_hex = COALESCE($3, colour_hex),
         captain_student_id = COALESCE($4, captain_student_id),
         status = COALESCE($5, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.colourHex ?? null,
        input.captainStudentId ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
