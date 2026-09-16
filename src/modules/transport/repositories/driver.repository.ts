import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface DriverRow {
  id: string;
  personId: string | null;
  fullName: string;
  phone: string | null;
  licenceNo: string;
  licenceExpiry: string;
  policeVerificationRef: string | null;
  verificationExpiry: string | null;
  status: string;
  /** Real columns (query.md), added specifically so the mockup's own
   * "Experience"/"Blood group" crew-card fields have real data behind them
   * instead of being fabricated -- NULL ("not recorded") until actually set. */
  experienceYears: number | null;
  bloodGroup: string | null;
}

export interface CreateDriverInput {
  personId?: string | null;
  fullName: string;
  phone?: string | null;
  licenceNo: string;
  licenceExpiry: string;
  policeVerificationRef?: string | null;
  verificationExpiry?: string | null;
  status?: string;
  experienceYears?: number | null;
  bloodGroup?: string | null;
}

export interface UpdateDriverInput {
  personId?: string | null;
  fullName?: string;
  phone?: string | null;
  licenceNo?: string;
  licenceExpiry?: string;
  policeVerificationRef?: string | null;
  verificationExpiry?: string | null;
  status?: string;
  experienceYears?: number | null;
  bloodGroup?: string | null;
}

const COLUMNS = `id, person_id AS "personId", full_name AS "fullName", phone, licence_no AS "licenceNo",
  licence_expiry AS "licenceExpiry", police_verification_ref AS "policeVerificationRef",
  verification_expiry AS "verificationExpiry", status, experience_years AS "experienceYears",
  blood_group AS "bloodGroup"`;

@Injectable()
export class DriverRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<DriverRow[]> {
    const { rows } = await executor.query<DriverRow>(
      `SELECT ${COLUMNS} FROM driver ORDER BY full_name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<DriverRow | null> {
    const { rows } = await executor.query<DriverRow>(
      `SELECT ${COLUMNS} FROM driver WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateDriverInput,
    executor: Queryable = this.postgres,
  ): Promise<DriverRow> {
    const { rows } = await executor.query<DriverRow>(
      `INSERT INTO driver
         (person_id, full_name, phone, licence_no, licence_expiry, police_verification_ref,
          verification_expiry, status, experience_years, blood_group)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'ACTIVE'), $9, $10)
       RETURNING ${COLUMNS}`,
      [
        input.personId ?? null,
        input.fullName,
        input.phone ?? null,
        input.licenceNo,
        input.licenceExpiry,
        input.policeVerificationRef ?? null,
        input.verificationExpiry ?? null,
        input.status ?? null,
        input.experienceYears ?? null,
        input.bloodGroup ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateDriverInput,
    executor: Queryable = this.postgres,
  ): Promise<DriverRow | null> {
    const { rows } = await executor.query<DriverRow>(
      `UPDATE driver SET
         person_id = COALESCE($2, person_id),
         full_name = COALESCE($3, full_name),
         phone = COALESCE($4, phone),
         licence_no = COALESCE($5, licence_no),
         licence_expiry = COALESCE($6, licence_expiry),
         police_verification_ref = COALESCE($7, police_verification_ref),
         verification_expiry = COALESCE($8, verification_expiry),
         status = COALESCE($9, status),
         experience_years = COALESCE($10, experience_years),
         blood_group = COALESCE($11, blood_group)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.personId ?? null,
        input.fullName ?? null,
        input.phone ?? null,
        input.licenceNo ?? null,
        input.licenceExpiry ?? null,
        input.policeVerificationRef ?? null,
        input.verificationExpiry ?? null,
        input.status ?? null,
        input.experienceYears ?? null,
        input.bloodGroup ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
