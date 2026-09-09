// Real "Term" mapping, confirmed against the schema before writing a line of this:
// there is no literal term/semester table anywhere in this database. What the
// Parent app's design calls a "Term" is fee_demand.instalment_no within one
// academic_year (reached via fee_demand -> student_fee_assignment -> fee_structure
// -> academic_year) — the same real column Finance's own Obligations screen shows
// as "Instalment". Real seed data confirms exactly this shape: instalment 1 due
// ~June, instalment 2 due ~November, per fee head, per academic year.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FeeTermRow {
  academicYearId: string;
  academicYearName: string;
  instalmentNo: number;
}

export interface FeeLineRow {
  id: string;
  feeHeadId: string | null;
  feeHeadName: string | null;
  amountPaise: string;
  lateFeePaise: string;
  paidPaise: string;
  dueDate: Date;
  state: string;
}

const TERM_JOIN = `
  FROM fee_demand fd
  JOIN student_fee_assignment sfa ON sfa.id = fd.assignment_id
  JOIN fee_structure fs ON fs.id = sfa.fee_structure_id
  JOIN academic_year ay ON ay.id = fs.academic_year_id
`;

@Injectable()
export class ParentFeeRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every distinct (academic year, instalment) this student actually has a real fee_demand under — never a hardcoded "Term 1/2/3" list, so a student with only one instalment on record shows only one. */
  async listTerms(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeTermRow[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT ay.id AS academic_year_id, ay.name AS academic_year_name, ay.start_date, fd.instalment_no
       ${TERM_JOIN}
       WHERE fd.student_id = $1
       ORDER BY ay.start_date ASC, fd.instalment_no ASC`,
      [studentId],
    );
    return rows.map((r: any) => ({
      academicYearId: r.academic_year_id,
      academicYearName: r.academic_year_name,
      instalmentNo: r.instalment_no,
    }));
  }

  /** Every fee_demand line for this student, this year, this instalment — one row per fee head (Tuition, Transport, ...), exactly what the Pay-fees tab lists. */
  async listLinesForTerm(
    studentId: string,
    academicYearId: string,
    instalmentNo: number,
    executor: Queryable = this.postgres,
  ): Promise<FeeLineRow[]> {
    const { rows } = await executor.query(
      `SELECT fd.id, fd.fee_head_id, fh.name AS fee_head_name, fd.amount_paise, fd.late_fee_paise, fd.paid_paise, fd.due_date, fd.state
       ${TERM_JOIN}
       LEFT JOIN fee_head fh ON fh.id = fd.fee_head_id
       WHERE fd.student_id = $1 AND fs.academic_year_id = $2 AND fd.instalment_no = $3
       ORDER BY fh.name ASC NULLS LAST`,
      [studentId, academicYearId, instalmentNo],
    );
    return rows.map((r: any) => ({
      id: r.id,
      feeHeadId: r.fee_head_id,
      feeHeadName: r.fee_head_name,
      amountPaise: r.amount_paise,
      lateFeePaise: r.late_fee_paise,
      paidPaise: r.paid_paise,
      dueDate: r.due_date,
      state: r.state,
    }));
  }

  /** Only the specific lines named, and only if every one of them genuinely belongs to this student — the real guard against a parent naming another family's fee_demand id in the pay request. Returns fewer rows than ids requested if any didn't match; the caller must check the count. */
  async findManyForStudent(
    studentId: string,
    feeDemandIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<FeeLineRow[]> {
    if (feeDemandIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT id, fee_head_id, amount_paise, late_fee_paise, paid_paise, due_date, state
       FROM fee_demand WHERE student_id = $1 AND id = ANY($2::uuid[])`,
      [studentId, feeDemandIds],
    );
    return rows.map((r: any) => ({
      id: r.id,
      feeHeadId: r.fee_head_id,
      feeHeadName: null,
      amountPaise: r.amount_paise,
      lateFeePaise: r.late_fee_paise,
      paidPaise: r.paid_paise,
      dueDate: r.due_date,
      state: r.state,
    }));
  }
}
