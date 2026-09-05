import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface FeeStructureLineRow {
  id: string;
  feeStructureId: string;
  feeHeadId: string;
  amountPaise: string;
  instalmentNo: number;
  dueDate: string;
  lateFeePaise: string;
}

export interface CreateFeeStructureLineInput {
  feeHeadId: string;
  amountPaise: number;
  instalmentNo?: number;
  dueDate: string;
  lateFeePaise?: number;
}

export interface UpdateFeeStructureLineInput {
  amountPaise?: number;
  dueDate?: string;
  lateFeePaise?: number;
}

const COLUMNS = `id, fee_structure_id AS "feeStructureId", fee_head_id AS "feeHeadId",
  amount_paise AS "amountPaise", instalment_no AS "instalmentNo", due_date AS "dueDate",
  late_fee_paise AS "lateFeePaise"`;

@Injectable()
export class FeeStructureLineRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStructureId(
    feeStructureId: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeStructureLineRow[]> {
    const { rows } = await executor.query<FeeStructureLineRow>(
      `SELECT ${COLUMNS} FROM fee_structure_line WHERE fee_structure_id = $1 ORDER BY instalment_no`,
      [feeStructureId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<FeeStructureLineRow | null> {
    const { rows } = await executor.query<FeeStructureLineRow>(
      `SELECT ${COLUMNS} FROM fee_structure_line WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    feeStructureId: string,
    input: CreateFeeStructureLineInput,
    executor: Queryable,
  ): Promise<FeeStructureLineRow> {
    const { rows } = await executor.query<FeeStructureLineRow>(
      `INSERT INTO fee_structure_line
         (fee_structure_id, fee_head_id, amount_paise, instalment_no, due_date, late_fee_paise)
       VALUES ($1, $2, $3, COALESCE($4, 1), $5, COALESCE($6, 0))
       RETURNING ${COLUMNS}`,
      [
        feeStructureId,
        input.feeHeadId,
        input.amountPaise,
        input.instalmentNo ?? null,
        input.dueDate,
        input.lateFeePaise ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateFeeStructureLineInput,
    executor: Queryable,
  ): Promise<FeeStructureLineRow | null> {
    const { rows } = await executor.query<FeeStructureLineRow>(
      `UPDATE fee_structure_line SET
         amount_paise = COALESCE($2, amount_paise),
         due_date = COALESCE($3, due_date),
         late_fee_paise = COALESCE($4, late_fee_paise)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.amountPaise ?? null, input.dueDate ?? null, input.lateFeePaise ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(id: string, executor: Queryable): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM fee_structure_line WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}
