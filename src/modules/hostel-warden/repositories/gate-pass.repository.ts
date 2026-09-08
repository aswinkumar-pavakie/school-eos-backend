// Issued on Warden approval of either a Gate Pass or Emergency Exit outing_request --
// see hostel-warden-approval-handlers.service.ts. The real, live `gate_pass` table
// already carries is_emergency/emergency_reason for exactly this distinction; nothing
// new is added to it.

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CreateGatePassInput {
  outingRequestId: string;
  studentId: string;
  isEmergency: boolean;
  emergencyReason?: string | null;
  approvedBy: string;
  validFrom: Date;
  validTo: Date;
}

export interface GatePassRow {
  id: string;
  outingRequestId: string | null;
  studentId: string;
  passNo: string;
  isEmergency: boolean;
  emergencyReason: string | null;
  approvedBy: string | null;
  validFrom: Date;
  validTo: Date;
  state: string;
}

const COLUMNS = `id, outing_request_id AS "outingRequestId", student_id AS "studentId",
  pass_no AS "passNo", is_emergency AS "isEmergency", emergency_reason AS "emergencyReason",
  approved_by AS "approvedBy", valid_from AS "validFrom", valid_to AS "validTo", state`;

@Injectable()
export class GatePassRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreateGatePassInput,
    executor: Queryable,
  ): Promise<GatePassRow> {
    // pass_no has no DB default and is a plain unique text column -- a fresh UUID
    // per pass guarantees no collision, so there's no unique-violation retry to write.
    const passNo = `GP-${randomUUID()}`;
    const { rows } = await executor.query<GatePassRow>(
      `INSERT INTO gate_pass
         (outing_request_id, student_id, pass_no, is_emergency, emergency_reason, approved_by, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.outingRequestId,
        input.studentId,
        passNo,
        input.isEmergency,
        input.emergencyReason ?? null,
        input.approvedBy,
        input.validFrom,
        input.validTo,
      ],
    );
    return rows[0];
  }

  async findByOutingRequestId(
    outingRequestId: string,
    executor: Queryable = this.postgres,
  ): Promise<GatePassRow | null> {
    const { rows } = await executor.query<GatePassRow>(
      `SELECT ${COLUMNS} FROM gate_pass WHERE outing_request_id = $1`,
      [outingRequestId],
    );
    return rows[0] ?? null;
  }
}
