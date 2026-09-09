import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface HostelRow {
  id: string;
  name: string;
  gender: string;
  wardenStaffId: string | null;
  capacity: number | null;
  status: string;
}

export interface CreateHostelInput {
  name: string;
  gender: string;
  wardenStaffId?: string | null;
  capacity?: number | null;
  status?: string;
}

export interface UpdateHostelInput {
  name?: string;
  gender?: string;
  wardenStaffId?: string | null;
  capacity?: number | null;
  status?: string;
}

const COLUMNS = `id, name, gender, warden_staff_id AS "wardenStaffId", capacity, status`;

@Injectable()
export class HostelRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<HostelRow[]> {
    const { rows } = await executor.query<HostelRow>(`SELECT ${COLUMNS} FROM hostel ORDER BY name`);
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<HostelRow | null> {
    const { rows } = await executor.query<HostelRow>(`SELECT ${COLUMNS} FROM hostel WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateHostelInput, executor: Queryable = this.postgres): Promise<HostelRow> {
    const { rows } = await executor.query<HostelRow>(
      `INSERT INTO hostel (name, gender, warden_staff_id, capacity, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [input.name, input.gender, input.wardenStaffId ?? null, input.capacity ?? null, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHostelInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelRow | null> {
    const { rows } = await executor.query<HostelRow>(
      `UPDATE hostel SET
         name = COALESCE($2, name),
         gender = COALESCE($3, gender),
         warden_staff_id = COALESCE($4, warden_staff_id),
         capacity = COALESCE($5, capacity),
         status = COALESCE($6, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.gender ?? null,
        input.wardenStaffId ?? null,
        input.capacity ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
