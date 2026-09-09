// Read-side of the real fee_demand/payment/student_fee_assignment tables --
// day-to-day collections/payments are still out of scope (see finance.module.ts),
// but a student's *current* fee status is read-only and belongs on their profile.
// All three tables already existed live in the DB with real data, no API in
// front of them yet.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentFeeAssignmentRow {
  id: string;
  academicYearId: string;
  academicYearName: string;
  grossPaise: string;
  concessionPaise: string;
  netPaise: string;
  status: string;
}

export interface StudentFeeDemandRow {
  id: string;
  feeHeadName: string | null;
  instalmentNo: number;
  amountPaise: string;
  lateFeePaise: string;
  paidPaise: string;
  dueDate: string;
  state: string;
}

export interface StudentPaymentRow {
  id: string;
  amountPaise: string;
  mode: string;
  state: string;
  initiatedAt: Date;
  confirmedAt: Date | null;
  receiptNo: string | null;
  issuedOn: string | null;
}

@Injectable()
export class StudentFeesRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The student's fee assignment for the *current* academic year, if any --
   * a student with no assignment yet (e.g. newly admitted, fees not yet
   * configured for them) simply has no row here. */
  async findCurrentAssignment(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentFeeAssignmentRow | null> {
    const { rows } = await executor.query<{
      id: string;
      academic_year_id: string;
      academic_year_name: string;
      gross_paise: string;
      concession_paise: string;
      net_paise: string;
      status: string;
    }>(
      `SELECT sfa.id, sfa.academic_year_id, ay.name AS academic_year_name,
              sfa.gross_paise, sfa.concession_paise, sfa.net_paise, sfa.status
       FROM student_fee_assignment sfa
       JOIN academic_year ay ON ay.id = sfa.academic_year_id
       WHERE sfa.student_id = $1 AND ay.is_current = true
       LIMIT 1`,
      [studentId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      academicYearId: row.academic_year_id,
      academicYearName: row.academic_year_name,
      grossPaise: row.gross_paise,
      concessionPaise: row.concession_paise,
      netPaise: row.net_paise,
      status: row.status,
    };
  }

  async findDemandsByAssignment(
    assignmentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentFeeDemandRow[]> {
    const { rows } = await executor.query<{
      id: string;
      fee_head_name: string | null;
      instalment_no: number;
      amount_paise: string;
      late_fee_paise: string;
      paid_paise: string;
      due_date: string;
      state: string;
    }>(
      `SELECT fd.id, fh.name AS fee_head_name, fd.instalment_no, fd.amount_paise,
              fd.late_fee_paise, fd.paid_paise, fd.due_date, fd.state
       FROM fee_demand fd
       LEFT JOIN fee_head fh ON fh.id = fd.fee_head_id
       WHERE fd.assignment_id = $1
       ORDER BY fd.due_date, fd.instalment_no`,
      [assignmentId],
    );
    return rows.map((row) => ({
      id: row.id,
      feeHeadName: row.fee_head_name,
      instalmentNo: row.instalment_no,
      amountPaise: row.amount_paise,
      lateFeePaise: row.late_fee_paise,
      paidPaise: row.paid_paise,
      dueDate: row.due_date,
      state: row.state,
    }));
  }

  /** Every payment made toward this student's fees (via whichever instalment(s)
   * it was allocated against), newest first -- the "fee/payment history" the
   * Student Profile's Finance section shows. Read-only: no payment action lives
   * on this path, same as everywhere else in Admin -> Finance. */
  async findPaymentsForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentPaymentRow[]> {
    const { rows } = await executor.query<{
      id: string;
      amount_paise: string;
      mode: string;
      state: string;
      initiated_at: Date;
      confirmed_at: Date | null;
      receipt_no: string | null;
      issued_on: string | null;
    }>(
      `SELECT DISTINCT pay.id, pay.amount_paise, pay.mode, pay.state,
              pay.initiated_at, pay.confirmed_at, r.receipt_no, r.issued_on
       FROM payment pay
       JOIN payment_allocation pa ON pa.payment_id = pay.id
       JOIN fee_demand fd ON fd.id = pa.fee_demand_id
       LEFT JOIN receipt r ON r.payment_id = pay.id
       WHERE fd.student_id = $1
       ORDER BY pay.initiated_at DESC`,
      [studentId],
    );
    return rows.map((row) => ({
      id: row.id,
      amountPaise: row.amount_paise,
      mode: row.mode,
      state: row.state,
      initiatedAt: row.initiated_at,
      confirmedAt: row.confirmed_at,
      receiptNo: row.receipt_no,
      issuedOn: row.issued_on,
    }));
  }
}
