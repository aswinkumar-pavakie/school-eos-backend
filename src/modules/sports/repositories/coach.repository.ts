import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CoachRow {
  id: string;
  personId: string | null;
  fullName: string;
  isExternal: boolean;
  contactPhone: string | null;
  qualification: string | null;
  policeVerificationRef: string | null;
  verificationExpiry: string | null;
  status: string;
  createdAt: Date;
}

export interface CreateCoachInput {
  personId?: string | null;
  fullName: string;
  isExternal?: boolean;
  contactPhone?: string | null;
  qualification?: string | null;
  policeVerificationRef?: string | null;
  verificationExpiry?: string | null;
  status?: string;
}

export interface UpdateCoachInput {
  fullName?: string;
  contactPhone?: string | null;
  qualification?: string | null;
  policeVerificationRef?: string | null;
  verificationExpiry?: string | null;
  status?: string;
}

const COLUMNS = `id, person_id AS "personId", full_name AS "fullName", is_external AS "isExternal",
  contact_phone AS "contactPhone", qualification, police_verification_ref AS "policeVerificationRef",
  verification_expiry AS "verificationExpiry", status, created_at AS "createdAt"`;

@Injectable()
export class CoachRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<CoachRow[]> {
    const { rows } = await executor.query<CoachRow>(
      `SELECT ${COLUMNS} FROM coach ORDER BY full_name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CoachRow | null> {
    const { rows } = await executor.query<CoachRow>(
      `SELECT ${COLUMNS} FROM coach WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateCoachInput,
    executor: Queryable = this.postgres,
  ): Promise<CoachRow> {
    const { rows } = await executor.query<CoachRow>(
      `INSERT INTO coach
         (person_id, full_name, is_external, contact_phone, qualification, police_verification_ref, verification_expiry, status)
       VALUES ($1, $2, COALESCE($3, false), $4, $5, $6, $7, COALESCE($8, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.personId ?? null,
        input.fullName,
        input.isExternal ?? null,
        input.contactPhone ?? null,
        input.qualification ?? null,
        input.policeVerificationRef ?? null,
        input.verificationExpiry ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateCoachInput,
    executor: Queryable = this.postgres,
  ): Promise<CoachRow | null> {
    const { rows } = await executor.query<CoachRow>(
      `UPDATE coach SET
         full_name = COALESCE($2, full_name),
         contact_phone = COALESCE($3, contact_phone),
         qualification = COALESCE($4, qualification),
         police_verification_ref = COALESCE($5, police_verification_ref),
         verification_expiry = COALESCE($6, verification_expiry),
         status = COALESCE($7, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.fullName ?? null,
        input.contactPhone ?? null,
        input.qualification ?? null,
        input.policeVerificationRef ?? null,
        input.verificationExpiry ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
