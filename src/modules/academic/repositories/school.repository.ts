// `school` is a true singleton -- CHECK (id = 1), one row, seeded already. Read/update
// only, never create/delete.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface SchoolRow {
  id: number;
  name: string;
  code: string;
  board: string;
  schoolType: string;
  recognitionNo: string | null;
  stateSchoolCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  logoObjectKey: string | null;
  timezone: string;
  defaultLocale: string;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSchoolInput {
  name?: string;
  code?: string;
  board?: string;
  schoolType?: string;
  recognitionNo?: string | null;
  stateSchoolCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  logoObjectKey?: string | null;
  timezone?: string;
  defaultLocale?: string;
  settings?: unknown;
}

const COLUMNS = `id, name, code, board, school_type AS "schoolType", recognition_no AS "recognitionNo",
  state_school_code AS "stateSchoolCode", address_line1 AS "addressLine1", address_line2 AS "addressLine2",
  city, district, state, pincode, contact_phone AS "contactPhone", contact_email AS "contactEmail",
  logo_object_key AS "logoObjectKey", timezone, default_locale AS "defaultLocale", settings,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class SchoolRepository {
  constructor(private readonly postgres: PostgresService) {}

  async get(executor: Queryable = this.postgres): Promise<SchoolRow | null> {
    const { rows } = await executor.query<SchoolRow>(
      `SELECT ${COLUMNS} FROM school WHERE id = 1`,
    );
    return rows[0] ?? null;
  }

  async update(input: UpdateSchoolInput, executor: Queryable = this.postgres): Promise<SchoolRow> {
    const { rows } = await executor.query<SchoolRow>(
      `UPDATE school SET
         name = COALESCE($1, name),
         code = COALESCE($2, code),
         board = COALESCE($3, board),
         school_type = COALESCE($4, school_type),
         recognition_no = COALESCE($5, recognition_no),
         state_school_code = COALESCE($6, state_school_code),
         address_line1 = COALESCE($7, address_line1),
         address_line2 = COALESCE($8, address_line2),
         city = COALESCE($9, city),
         district = COALESCE($10, district),
         state = COALESCE($11, state),
         pincode = COALESCE($12, pincode),
         contact_phone = COALESCE($13, contact_phone),
         contact_email = COALESCE($14, contact_email),
         logo_object_key = COALESCE($15, logo_object_key),
         timezone = COALESCE($16, timezone),
         default_locale = COALESCE($17, default_locale),
         settings = COALESCE($18, settings),
         updated_at = now()
       WHERE id = 1
       RETURNING ${COLUMNS}`,
      [
        input.name ?? null,
        input.code ?? null,
        input.board ?? null,
        input.schoolType ?? null,
        input.recognitionNo ?? null,
        input.stateSchoolCode ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.city ?? null,
        input.district ?? null,
        input.state ?? null,
        input.pincode ?? null,
        input.contactPhone ?? null,
        input.contactEmail ?? null,
        input.logoObjectKey ?? null,
        input.timezone ?? null,
        input.defaultLocale ?? null,
        input.settings ? JSON.stringify(input.settings) : null,
      ],
    );
    return rows[0];
  }
}
