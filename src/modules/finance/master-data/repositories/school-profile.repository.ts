// Read-only — the school's own institutional profile (single row, single-tenant
// deployment). Used only to put a real header on a printed receipt: name, address,
// recognition number, contact details — never fabricated, never a placeholder school
// name.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface SchoolProfileRow {
  name: string;
  board: string | null;
  recognitionNo: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

function mapRow(row: any): SchoolProfileRow {
  return {
    name: row.name,
    board: row.board,
    recognitionNo: row.recognition_no,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    district: row.district,
    state: row.state,
    pincode: row.pincode,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
  };
}

@Injectable()
export class SchoolProfileRepository {
  constructor(private readonly postgres: PostgresService) {}

  async get(
    executor: Queryable = this.postgres,
  ): Promise<SchoolProfileRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM school ORDER BY id ASC LIMIT 1`,
    );
    return rows.length ? mapRow(rows[0]) : null;
  }
}
