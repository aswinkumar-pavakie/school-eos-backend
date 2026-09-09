import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FeeDemandRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  academicYearName: string;
  feeHeadName: string | null;
  amountPaise: string;
  lateFeePaise: string;
  paidPaise: string;
  pendingPaise: string;
  dueDate: string;
  state: string;
}

export interface FeeDemandFilter {
  academicYearId?: string;
  gradeId?: string;
  sectionId?: string;
  state?: string;
  search?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `fd.id, fd.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
  g.name AS "gradeName", sec.name AS "sectionName", ay.name AS "academicYearName",
  fh.name AS "feeHeadName", fd.amount_paise AS "amountPaise", fd.late_fee_paise AS "lateFeePaise",
  fd.paid_paise AS "paidPaise", (fd.amount_paise + fd.late_fee_paise - fd.paid_paise) AS "pendingPaise",
  fd.due_date AS "dueDate", fd.state`;

const FROM = `fee_demand fd
  JOIN student_fee_assignment sfa ON sfa.id = fd.assignment_id
  JOIN academic_year ay ON ay.id = sfa.academic_year_id
  JOIN student s ON s.id = fd.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = fd.student_id
    AND se.academic_year_id = sfa.academic_year_id AND se.status = 'ACTIVE'
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id
  LEFT JOIN fee_head fh ON fh.id = fd.fee_head_id`;

/** Admin's read-only "which students have pending/outstanding/overdue fees"
 * list -- section 3 of Admin -> Finance. One row per fee_demand instalment,
 * joined out to the student's name/class and the fee head/academic year names
 * so the list needs no further lookups on the frontend. */
@Injectable()
export class FeeDemandRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: FeeDemandFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: FeeDemandRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`sfa.academic_year_id = $${params.length}`);
    }
    if (filter.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`g.id = $${params.length}`);
    }
    if (filter.sectionId) {
      params.push(filter.sectionId);
      conditions.push(`sec.id = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`fd.state = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length} OR lower(s.admission_no) LIKE $${params.length})`,
      );
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<FeeDemandRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY fd.due_date, p.first_name, p.last_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }
}
