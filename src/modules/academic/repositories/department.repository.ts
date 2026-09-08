// hod_staff_id references `staff`, a table this module doesn't own (Phase 2 owns it).
// Accepted here as an opaque optional UUID -- an invalid reference surfaces as a foreign
// key violation (23503), translated to a clean 400 by the service layer, not validated
// against a staff repository this module doesn't have.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
  hodStaffId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDepartmentInput {
  name: string;
  code?: string | null;
  hodStaffId?: string | null;
  status?: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  code?: string | null;
  hodStaffId?: string | null;
  status?: string;
}

const COLUMNS = `id, name, code, hod_staff_id AS "hodStaffId", status,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class DepartmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<DepartmentRow[]> {
    const { rows } = await executor.query<DepartmentRow>(
      `SELECT ${COLUMNS} FROM department ORDER BY name`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<DepartmentRow | null> {
    const { rows } = await executor.query<DepartmentRow>(
      `SELECT ${COLUMNS} FROM department WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateDepartmentInput,
    executor: Queryable = this.postgres,
  ): Promise<DepartmentRow> {
    const { rows } = await executor.query<DepartmentRow>(
      `INSERT INTO department (name, code, hod_staff_id, status)
       VALUES ($1, $2, $3, COALESCE($4, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [input.name, input.code ?? null, input.hodStaffId ?? null, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateDepartmentInput,
    executor: Queryable = this.postgres,
  ): Promise<DepartmentRow | null> {
    const { rows } = await executor.query<DepartmentRow>(
      `UPDATE department SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         hod_staff_id = COALESCE($4, hod_staff_id),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.code ?? null, input.hodStaffId ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }
}
