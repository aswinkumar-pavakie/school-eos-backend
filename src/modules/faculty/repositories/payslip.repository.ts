// Read-only over the existing payroll_period/payslip tables -- no new schema,
// no request/approval gating (matches the design, which has no request UI on
// this tile at all; "HR Payroll request" is Feature 12's own separate,
// gated flow). A payslip is only shown once its parent payroll_period has
// actually reached state='PAID' -- Finance's real, final disbursement step,
// not merely 'PROCESSED'/'APPROVED' (numbers that could still change before
// money actually moves).
//
// Real unit quirk in the seed data: gross_paise/deductions_paise/net_paise
// are genuinely paise (bigint, ÷100 for rupees, same convention as every
// other *_paise column in this codebase) -- but the `breakdown` jsonb's own
// line-item values (basic/hra/da/pf/etc.) are already stored in whole
// rupees, not paise. Never divide those by 100 again.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface PayslipRow {
  id: string;
  payrollPeriodId: string;
  month: number;
  year: number;
  grossPaise: string;
  deductionsPaise: string;
  netPaise: string;
  breakdown: Record<string, number> | null;
  pdfObjectKey: string | null;
}

const COLUMNS = `ps.id, ps.payroll_period_id, pp.month, pp.year,
  ps.gross_paise, ps.deductions_paise, ps.net_paise, ps.breakdown, ps.pdf_object_key`;

const FROM = `FROM payslip ps JOIN payroll_period pp ON pp.id = ps.payroll_period_id`;

function mapRow(row: any): PayslipRow {
  return {
    id: row.id,
    payrollPeriodId: row.payroll_period_id,
    month: row.month,
    year: row.year,
    grossPaise: row.gross_paise,
    deductionsPaise: row.deductions_paise,
    netPaise: row.net_paise,
    breakdown: row.breakdown,
    pdfObjectKey: row.pdf_object_key,
  };
}

@Injectable()
export class PayslipRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForStaff(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<PayslipRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE ps.staff_id = $1 AND pp.state = 'PAID' ORDER BY pp.year DESC, pp.month DESC`,
      [staffId],
    );
    return rows.map(mapRow);
  }

  async findOneForStaff(
    staffId: string,
    payslipId: string,
    executor: Queryable = this.postgres,
  ): Promise<PayslipRow | null> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE ps.id = $1 AND ps.staff_id = $2 AND pp.state = 'PAID'`,
      [payslipId, staffId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }
}
