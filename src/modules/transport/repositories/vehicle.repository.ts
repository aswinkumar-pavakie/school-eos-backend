import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface VehicleRow {
  id: string;
  registrationNo: string;
  model: string | null;
  capacity: number;
  ownership: string | null;
  operationalStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVehicleInput {
  registrationNo: string;
  model?: string | null;
  capacity: number;
  ownership?: string | null;
  operationalStatus?: string;
}

export interface UpdateVehicleInput {
  registrationNo?: string;
  model?: string | null;
  capacity?: number;
  ownership?: string | null;
  operationalStatus?: string;
}

const COLUMNS = `id, registration_no AS "registrationNo", model, capacity, ownership,
  operational_status AS "operationalStatus", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class VehicleRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<VehicleRow[]> {
    const { rows } = await executor.query<VehicleRow>(
      `SELECT ${COLUMNS} FROM vehicle ORDER BY registration_no`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<VehicleRow | null> {
    const { rows } = await executor.query<VehicleRow>(`SELECT ${COLUMNS} FROM vehicle WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateVehicleInput, executor: Queryable = this.postgres): Promise<VehicleRow> {
    const { rows } = await executor.query<VehicleRow>(
      `INSERT INTO vehicle (registration_no, model, capacity, ownership, operational_status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.registrationNo,
        input.model ?? null,
        input.capacity,
        input.ownership ?? null,
        input.operationalStatus ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateVehicleInput,
    executor: Queryable = this.postgres,
  ): Promise<VehicleRow | null> {
    const { rows } = await executor.query<VehicleRow>(
      `UPDATE vehicle SET
         registration_no = COALESCE($2, registration_no),
         model = COALESCE($3, model),
         capacity = COALESCE($4, capacity),
         ownership = COALESCE($5, ownership),
         operational_status = COALESCE($6, operational_status),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.registrationNo ?? null,
        input.model ?? null,
        input.capacity ?? null,
        input.ownership ?? null,
        input.operationalStatus ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
