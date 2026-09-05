// The real per-student canteen/ID-card wallet + its freeze controls. Freezing
// stops spending (enforced wherever the wallet is actually charged -- POS/mobile,
// out of scope here) without touching the student record itself; unlike
// fee_head/fee_structure this is squarely an Admin safety control, not something
// deferred to the separate Finance/Accounts login.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface StudentWalletRow {
  id: string;
  studentId: string;
  balancePaise: string;
  status: string;
  frozenReason: string | null;
  frozenBy: string | null;
  frozenAt: Date | null;
}

function mapRow(row: {
  id: string;
  student_id: string;
  balance_paise: string;
  status: string;
  frozen_reason: string | null;
  frozen_by: string | null;
  frozen_at: Date | null;
}): StudentWalletRow {
  return {
    id: row.id,
    studentId: row.student_id,
    balancePaise: row.balance_paise,
    status: row.status,
    frozenReason: row.frozen_reason,
    frozenBy: row.frozen_by,
    frozenAt: row.frozen_at,
  };
}

const COLUMNS = `id, student_id, balance_paise, status, frozen_reason, frozen_by, frozen_at`;

@Injectable()
export class StudentWalletRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStudentId(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentWalletRow | null> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM wallet WHERE student_id = $1`, [
      studentId,
    ]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async freeze(
    id: string,
    reason: string,
    frozenBy: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentWalletRow | null> {
    const { rows } = await executor.query(
      `UPDATE wallet
       SET status = 'FROZEN', frozen_reason = $2, frozen_by = $3, frozen_at = now(),
           version = version + 1, updated_at = now()
       WHERE id = $1 AND status != 'FROZEN'
       RETURNING ${COLUMNS}`,
      [id, reason, frozenBy],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async unfreeze(id: string, executor: Queryable = this.postgres): Promise<StudentWalletRow | null> {
    const { rows } = await executor.query(
      `UPDATE wallet
       SET status = 'ACTIVE', frozen_reason = NULL, frozen_by = NULL, frozen_at = NULL,
           version = version + 1, updated_at = now()
       WHERE id = $1 AND status = 'FROZEN'
       RETURNING ${COLUMNS}`,
      [id],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}
