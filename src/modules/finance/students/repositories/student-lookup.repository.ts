// Finance's own minimal, read-only student lookup — no People/Academics module exists
// yet in this codebase to list/search students from, and the Student Workspace (the
// hub every other Finance screen links into) genuinely can't function without one.
// Scoped strictly to what Finance needs: identity, current enrolment (grade/section),
// this year's fee assignment, and the ledger totals derived from it. Real columns only
// (student.community_category, not an invented "quota" field — see schema.prisma).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export type DueStatus =
  'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING' | 'NO_DEMAND';

export interface StudentLedgerRow {
  id: string;
  admissionNo: string;
  displayName: string;
  communityCategory: string | null;
  gradeName: string | null;
  sectionName: string | null;
  academicYearName: string | null;
  assignmentId: string | null;
  totalDemandPaise: string;
  paidPaise: string;
  outstandingPaise: string;
  lastPaymentAt: Date | null;
  dueStatus: DueStatus;
}

function mapRow(row: any): StudentLedgerRow {
  return {
    id: row.id,
    admissionNo: row.admission_no,
    displayName: row.display_name,
    communityCategory: row.community_category,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    academicYearName: row.academic_year_name,
    assignmentId: row.assignment_id,
    totalDemandPaise: row.total_demand_paise,
    paidPaise: row.paid_paise,
    outstandingPaise: row.outstanding_paise,
    lastPaymentAt: row.last_payment_at,
    dueStatus: row.due_status,
  };
}

// due_status computed once in SQL (not post-fetch in JS) so filtering + pagination +
// the total count all agree with each other.
const LEDGER_CTE = `
  WITH ledger AS (
    SELECT
      s.id, s.admission_no, s.community_category,
      p.display_name,
      g.id AS grade_id,
      g.name AS grade_name,
      sec.name AS section_name,
      ay.name AS academic_year_name,
      sfa.id AS assignment_id,
      COALESCE(demand.total_demand_paise, '0')::text AS total_demand_paise,
      COALESCE(demand.paid_paise, '0')::text AS paid_paise,
      (COALESCE(demand.total_demand_paise, 0) - COALESCE(demand.paid_paise, 0))::text AS outstanding_paise,
      last_pay.last_payment_at,
      CASE
        WHEN COALESCE(demand.total_demand_paise, 0) = 0 THEN 'NO_DEMAND'
        WHEN COALESCE(demand.paid_paise, 0) >= demand.total_demand_paise THEN 'PAID'
        WHEN COALESCE(demand.has_overdue, false) THEN 'OVERDUE'
        WHEN COALESCE(demand.paid_paise, 0) > 0 THEN 'PARTIAL'
        ELSE 'PENDING'
      END AS due_status
    FROM student s
    JOIN person p ON p.id = s.person_id
    LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
      AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
    LEFT JOIN section sec ON sec.id = se.section_id
    LEFT JOIN grade g ON g.id = sec.grade_id
    LEFT JOIN academic_year ay ON ay.id = se.academic_year_id
    LEFT JOIN student_fee_assignment sfa ON sfa.student_id = s.id
      AND sfa.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
    LEFT JOIN LATERAL (
      SELECT
        SUM(fd.amount_paise + fd.late_fee_paise) AS total_demand_paise,
        SUM(fd.paid_paise) AS paid_paise,
        BOOL_OR(fd.state = 'OVERDUE') AS has_overdue
      FROM fee_demand fd WHERE fd.assignment_id = sfa.id
    ) demand ON true
    LEFT JOIN LATERAL (
      SELECT MAX(pay.confirmed_at) AS last_payment_at
      FROM payment_allocation pa
      JOIN payment pay ON pay.id = pa.payment_id
      JOIN fee_demand fd2 ON fd2.id = pa.fee_demand_id
      WHERE fd2.assignment_id = sfa.id
    ) last_pay ON true
  )
`;

@Injectable()
export class StudentLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(
    filter: { search?: string; gradeId?: string; dueStatus?: DueStatus },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: StudentLedgerRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const whereClause = `
      WHERE ($1::text IS NULL OR display_name ILIKE '%' || $1 || '%' OR admission_no ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR grade_id = $2)
        AND ($3::text IS NULL OR due_status = $3)
    `;
    const params = [
      filter.search ?? null,
      filter.gradeId ?? null,
      filter.dueStatus ?? null,
    ];

    const { rows: countRows } = await executor.query(
      `${LEDGER_CTE} SELECT COUNT(*)::int AS total FROM ledger ${whereClause}`,
      params,
    );
    const { rows } = await executor.query(
      `${LEDGER_CTE} SELECT * FROM ledger ${whereClause} ORDER BY display_name ASC LIMIT $4 OFFSET $5`,
      [...params, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  async getById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentLedgerRow | null> {
    const { rows } = await executor.query(
      `${LEDGER_CTE} SELECT * FROM ledger WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }
}
