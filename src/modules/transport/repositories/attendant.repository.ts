import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AttendantRow {
  id: string;
  personId: string | null;
  fullName: string;
  phone: string | null;
  policeVerificationRef: string | null;
  verificationExpiry: string | null;
  status: string;
}

export interface CreateAttendantInput {
  personId?: string | null;
  fullName: string;
  phone?: string | null;
  policeVerificationRef?: string | null;
  verificationExpiry?: string | null;
  status?: string;
}

export interface UpdateAttendantInput {
  personId?: string | null;
  fullName?: string;
  phone?: string | null;
  policeVerificationRef?: string | null;
  verificationExpiry?: string | null;
  status?: string;
}

const COLUMNS = `id, person_id AS "personId", full_name AS "fullName", phone,
  police_verification_ref AS "policeVerificationRef", verification_expiry AS "verificationExpiry", status`;

@Injectable()
export class AttendantRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<AttendantRow[]> {
    const { rows } = await executor.query<AttendantRow>(
      `SELECT ${COLUMNS} FROM attendant ORDER BY full_name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AttendantRow | null> {
    const { rows } = await executor.query<AttendantRow>(
      `SELECT ${COLUMNS} FROM attendant WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateAttendantInput,
    executor: Queryable = this.postgres,
  ): Promise<AttendantRow> {
    const { rows } = await executor.query<AttendantRow>(
      `INSERT INTO attendant (person_id, full_name, phone, police_verification_ref, verification_expiry, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.personId ?? null,
        input.fullName,
        input.phone ?? null,
        input.policeVerificationRef ?? null,
        input.verificationExpiry ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateAttendantInput,
    executor: Queryable = this.postgres,
  ): Promise<AttendantRow | null> {
    const { rows } = await executor.query<AttendantRow>(
      `UPDATE attendant SET
         person_id = COALESCE($2, person_id),
         full_name = COALESCE($3, full_name),
         phone = COALESCE($4, phone),
         police_verification_ref = COALESCE($5, police_verification_ref),
         verification_expiry = COALESCE($6, verification_expiry),
         status = COALESCE($7, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.personId ?? null,
        input.fullName ?? null,
        input.phone ?? null,
        input.policeVerificationRef ?? null,
        input.verificationExpiry ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
