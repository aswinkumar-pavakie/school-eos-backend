import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export interface ConcessionRow {
  id: string;
  studentId: string;
  studentDisplayName: string | null;
  studentAdmissionNo: string | null;
  academicYearId: string;
  concessionType: string;
  amountPaise: string | null;
  percent: string | null;
  reason: string;
  approvalRequestId: string | null;
  state: string;
  createdAt: Date;
}

function mapRow(row: any): ConcessionRow {
  return {
    id: row.id,
    studentId: row.student_id,
    studentDisplayName: row.student_display_name ?? null,
    studentAdmissionNo: row.student_admission_no ?? null,
    academicYearId: row.academic_year_id,
    concessionType: row.concession_type,
    amountPaise: row.amount_paise,
    percent: row.percent,
    reason: row.reason,
    approvalRequestId: row.approval_request_id,
    state: row.state,
    createdAt: row.created_at,
  };
}

// Never show a raw student_id UUID where a real name belongs — every read joins back
// to student -> person for a display name + admission number.
const SELECT_WITH_JOINS = `
  SELECT c.*, p.display_name AS student_display_name, s.admission_no AS student_admission_no
  FROM concession c
  LEFT JOIN student s ON s.id = c.student_id
  LEFT JOIN person p ON p.id = s.person_id
`;

@Injectable()
export class ConcessionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      studentId: string;
      academicYearId: string;
      concessionType: string;
      amountPaise: string | null;
      percent: string | null;
      reason: string;
    },
    executor: Queryable,
  ): Promise<ConcessionRow> {
    const { rows } = await executor.query(
      `INSERT INTO concession
         (student_id, academic_year_id, concession_type, amount_paise, percent, reason, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       RETURNING *`,
      [
        input.studentId,
        input.academicYearId,
        input.concessionType,
        input.amountPaise,
        input.percent,
        input.reason,
      ],
    );
    return mapRow(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<ConcessionRow | null> {
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS} WHERE c.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<ConcessionRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM concession WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async list(
    filter: { studentId?: string; state?: string; studentSearch?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: ConcessionRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const search = filter.studentSearch?.trim()
      ? `%${filter.studentSearch.trim()}%`
      : null;
    const params = [filter.studentId ?? null, filter.state ?? null, search];
    const whereClause = `
      WHERE ($1::uuid IS NULL OR c.student_id = $1)
        AND ($2::text IS NULL OR c.state = $2)
        AND ($3::text IS NULL OR p.display_name ILIKE $3 OR s.admission_no ILIKE $3)
    `;
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total
       FROM concession c
       LEFT JOIN student s ON s.id = c.student_id
       LEFT JOIN person p ON p.id = s.person_id
       ${whereClause}`,
      params,
    );
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS}
       ${whereClause}
       ORDER BY c.created_at DESC LIMIT $4 OFFSET $5`,
      [...params, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  async update(
    id: string,
    input: {
      amountPaise?: string | null;
      percent?: string | null;
      reason?: string;
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE concession
       SET amount_paise = COALESCE($2, amount_paise),
           percent = COALESCE($3, percent),
           reason = COALESCE($4, reason)
       WHERE id = $1`,
      [
        id,
        input.amountPaise ?? null,
        input.percent ?? null,
        input.reason ?? null,
      ],
    );
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE concession SET approval_request_id = $2 WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(`UPDATE concession SET state = $2 WHERE id = $1`, [
      id,
      state,
    ]);
  }
}
