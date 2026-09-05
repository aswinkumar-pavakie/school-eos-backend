// "Financial Obligation" in the API doc maps onto the `fee_demand` table — there is no
// model literally named "obligation" in the schema (confirmed by grep; see the Finance
// domain research notes). fee_demand already carries everything an obligation needs:
// amount owed, what's been paid so far, due date, and lifecycle state.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';
import { PageQuery, toOffsetLimit } from '../../../../common/pagination/pagination.util';

export interface FeeDemandRow {
  id: string;
  assignmentId: string;
  studentId: string;
  studentDisplayName: string | null;
  studentAdmissionNo: string | null;
  feeHeadId: string | null;
  instalmentNo: number;
  amountPaise: string;
  lateFeePaise: string;
  paidPaise: string;
  dueDate: Date;
  state: string;
  bulkImportJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): FeeDemandRow {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    studentDisplayName: row.student_display_name ?? null,
    studentAdmissionNo: row.student_admission_no ?? null,
    feeHeadId: row.fee_head_id,
    instalmentNo: row.instalment_no,
    amountPaise: row.amount_paise,
    lateFeePaise: row.late_fee_paise,
    paidPaise: row.paid_paise,
    dueDate: row.due_date,
    state: row.state,
    bulkImportJobId: row.bulk_import_job_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_WITH_JOINS = `
  SELECT fd.*, p.display_name AS student_display_name, s.admission_no AS student_admission_no
  FROM fee_demand fd
  LEFT JOIN student s ON s.id = fd.student_id
  LEFT JOIN person p ON p.id = s.person_id
`;

@Injectable()
export class FeeDemandRepository {
  constructor(private readonly postgres: PostgresService) {}

  // Deliberately does NOT reference bulk_import_job_id — that column only exists once
  // database/migrations/0002_bulk_import_job.sql has been applied, and manual
  // obligation creation (this method) must keep working regardless of whether the
  // separate Bulk Import feature's migration has been run yet. See createFromImport
  // below for the bulk-import-specific path that does use it.
  async create(
    input: {
      assignmentId: string;
      studentId: string;
      feeHeadId: string | null;
      instalmentNo: number;
      amountPaise: string;
      lateFeePaise: string;
      dueDate: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<FeeDemandRow> {
    const { rows } = await executor.query(
      `INSERT INTO fee_demand
         (assignment_id, student_id, fee_head_id, instalment_no, amount_paise, late_fee_paise, due_date, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING *`,
      [
        input.assignmentId,
        input.studentId,
        input.feeHeadId,
        input.instalmentNo,
        input.amountPaise,
        input.lateFeePaise,
        input.dueDate,
      ],
    );
    return mapRow(rows[0]);
  }

  /** Used only by ObligationImportsService.confirm — requires migration 0002 to have been applied. */
  async createFromImport(
    input: {
      assignmentId: string;
      studentId: string;
      feeHeadId: string | null;
      instalmentNo: number;
      amountPaise: string;
      lateFeePaise: string;
      dueDate: string;
      bulkImportJobId: string;
    },
    executor: Queryable,
  ): Promise<FeeDemandRow> {
    const { rows } = await executor.query(
      `INSERT INTO fee_demand
         (assignment_id, student_id, fee_head_id, instalment_no, amount_paise, late_fee_paise,
          due_date, state, bulk_import_job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
       RETURNING *`,
      [
        input.assignmentId,
        input.studentId,
        input.feeHeadId,
        input.instalmentNo,
        input.amountPaise,
        input.lateFeePaise,
        input.dueDate,
        input.bulkImportJobId,
      ],
    );
    return mapRow(rows[0]);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<FeeDemandRow | null> {
    const { rows } = await executor.query(`${SELECT_WITH_JOINS} WHERE fd.id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, executor: Queryable): Promise<FeeDemandRow | null> {
    const { rows } = await executor.query(`SELECT * FROM fee_demand WHERE id = $1 FOR UPDATE`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async list(
    filter: { studentId?: string; state?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: FeeDemandRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total FROM fee_demand
       WHERE ($1::uuid IS NULL OR student_id = $1) AND ($2::text IS NULL OR state = $2)`,
      [filter.studentId ?? null, filter.state ?? null],
    );
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS}
       WHERE ($1::uuid IS NULL OR fd.student_id = $1) AND ($2::text IS NULL OR fd.state = $2)
       ORDER BY fd.due_date ASC
       LIMIT $3 OFFSET $4`,
      [filter.studentId ?? null, filter.state ?? null, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  async setState(id: string, state: string, executor: Queryable): Promise<void> {
    await executor.query(`UPDATE fee_demand SET state = $2, updated_at = now() WHERE id = $1`, [
      id,
      state,
    ]);
  }

  async applyAllocation(
    id: string,
    amountPaise: string,
    executor: Queryable,
  ): Promise<FeeDemandRow> {
    const { rows } = await executor.query(
      `UPDATE fee_demand
       SET paid_paise = paid_paise + $2,
           state = CASE
             WHEN paid_paise + $2 >= amount_paise + late_fee_paise THEN 'PAID'
             ELSE 'PARTIAL'
           END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, amountPaise],
    );
    return mapRow(rows[0]);
  }
}
