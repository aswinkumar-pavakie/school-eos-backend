import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export interface FeeStructureLineInput {
  feeHeadId: string;
  amountPaise: string;
  instalmentNo?: number;
  dueDate: string;
  lateFeePaise?: string;
}

export interface FeeStructureRow {
  id: string;
  academicYearId: string;
  academicYearName: string | null;
  gradeId: string;
  gradeName: string | null;
  mediumId: string | null;
  category: string | null;
  totalPaise: string;
  approvalRequestId: string | null;
  state: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeStructureLineRow {
  id: string;
  feeStructureId: string;
  feeHeadId: string;
  feeHeadName: string | null;
  amountPaise: string;
  instalmentNo: number;
  dueDate: Date;
  lateFeePaise: string;
}

function mapStructure(row: any): FeeStructureRow {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name ?? null,
    gradeId: row.grade_id,
    gradeName: row.grade_name ?? null,
    mediumId: row.medium_id,
    category: row.category,
    totalPaise: row.total_paise,
    approvalRequestId: row.approval_request_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLine(row: any): FeeStructureLineRow {
  return {
    id: row.id,
    feeStructureId: row.fee_structure_id,
    feeHeadId: row.fee_head_id,
    feeHeadName: row.fee_head_name ?? null,
    amountPaise: row.amount_paise,
    instalmentNo: row.instalment_no,
    dueDate: row.due_date,
    lateFeePaise: row.late_fee_paise,
  };
}

// Every read joins back to grade/academic_year — display-only, never used to filter
// or write. Keeps the frontend from ever showing a raw UUID fragment as if it were a
// name.
const SELECT_WITH_JOINS = `
  SELECT fs.*, g.name AS grade_name, ay.name AS academic_year_name
  FROM fee_structure fs
  LEFT JOIN grade g ON g.id = fs.grade_id
  LEFT JOIN academic_year ay ON ay.id = fs.academic_year_id
`;

@Injectable()
export class FeeStructureRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      academicYearId: string;
      gradeId: string;
      mediumId: string | null;
      category: string | null;
      totalPaise: string;
    },
    executor: Queryable,
  ): Promise<FeeStructureRow> {
    const { rows } = await executor.query(
      `INSERT INTO fee_structure (academic_year_id, grade_id, medium_id, category, total_paise, state)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT')
       RETURNING *`,
      [
        input.academicYearId,
        input.gradeId,
        input.mediumId,
        input.category,
        input.totalPaise,
      ],
    );
    return mapStructure(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS} WHERE fs.id = $1`,
      [id],
    );
    return rows.length ? mapStructure(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<FeeStructureRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM fee_structure WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapStructure(rows[0]) : null;
  }

  async list(
    filter: { academicYearId?: string; gradeId?: string; state?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: FeeStructureRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total FROM fee_structure
       WHERE ($1::uuid IS NULL OR academic_year_id = $1)
         AND ($2::uuid IS NULL OR grade_id = $2)
         AND ($3::text IS NULL OR state = $3)`,
      [
        filter.academicYearId ?? null,
        filter.gradeId ?? null,
        filter.state ?? null,
      ],
    );
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS}
       WHERE ($1::uuid IS NULL OR fs.academic_year_id = $1)
         AND ($2::uuid IS NULL OR fs.grade_id = $2)
         AND ($3::text IS NULL OR fs.state = $3)
       ORDER BY fs.created_at DESC
       LIMIT $4 OFFSET $5`,
      [
        filter.academicYearId ?? null,
        filter.gradeId ?? null,
        filter.state ?? null,
        limit,
        offset,
      ],
    );
    return { rows: rows.map(mapStructure), total: countRows[0].total };
  }

  async updateCategoryAndTotal(
    id: string,
    category: string | null,
    totalPaise: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE fee_structure SET category = $2, total_paise = $3, updated_at = now() WHERE id = $1`,
      [id, category, totalPaise],
    );
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE fee_structure SET state = $2, updated_at = now() WHERE id = $1`,
      [id, state],
    );
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE fee_structure SET approval_request_id = $2, updated_at = now() WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async delete(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `DELETE FROM fee_structure_line WHERE fee_structure_id = $1`,
      [id],
    );
    await executor.query(`DELETE FROM fee_structure WHERE id = $1`, [id]);
  }

  async replaceLines(
    feeStructureId: string,
    lines: FeeStructureLineInput[],
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `DELETE FROM fee_structure_line WHERE fee_structure_id = $1`,
      [feeStructureId],
    );
    for (const line of lines) {
      await executor.query(
        `INSERT INTO fee_structure_line
           (fee_structure_id, fee_head_id, amount_paise, instalment_no, due_date, late_fee_paise)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          feeStructureId,
          line.feeHeadId,
          line.amountPaise,
          line.instalmentNo ?? 1,
          line.dueDate,
          line.lateFeePaise ?? '0',
        ],
      );
    }
  }

  async listLines(
    feeStructureId: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureLineRow[]> {
    const { rows } = await executor.query(
      `SELECT fsl.*, fh.name AS fee_head_name
       FROM fee_structure_line fsl
       LEFT JOIN fee_head fh ON fh.id = fsl.fee_head_id
       WHERE fsl.fee_structure_id = $1 ORDER BY fsl.instalment_no ASC`,
      [feeStructureId],
    );
    return rows.map(mapLine);
  }
}
