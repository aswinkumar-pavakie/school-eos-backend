import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export interface ExpenseRow {
  id: string;
  categoryId: string;
  amountPaise: string;
  incurredOn: Date;
  vendorName: string | null;
  description: string | null;
  billObjectKey: string | null;
  recordedBy: string | null;
  approvalRequestId: string | null;
  state: string;
  createdAt: Date;
}

function mapRow(row: any): ExpenseRow {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountPaise: row.amount_paise,
    incurredOn: row.incurred_on,
    vendorName: row.vendor_name,
    description: row.description,
    billObjectKey: row.bill_object_key,
    recordedBy: row.recorded_by,
    approvalRequestId: row.approval_request_id,
    state: row.state,
    createdAt: row.created_at,
  };
}

@Injectable()
export class ExpenseRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      categoryId: string;
      amountPaise: string;
      incurredOn: string;
      vendorName?: string | null;
      description?: string | null;
      billObjectKey?: string | null;
      recordedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<ExpenseRow> {
    const { rows } = await executor.query(
      `INSERT INTO expense
         (category_id, amount_paise, incurred_on, vendor_name, description, bill_object_key,
          recorded_by, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RECORDED')
       RETURNING *`,
      [
        input.categoryId,
        input.amountPaise,
        input.incurredOn,
        input.vendorName ?? null,
        input.description ?? null,
        input.billObjectKey ?? null,
        input.recordedBy,
      ],
    );
    return mapRow(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<ExpenseRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM expense WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<ExpenseRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM expense WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async list(
    filter: { state?: string; categoryId?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: ExpenseRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total FROM expense
       WHERE ($1::text IS NULL OR state = $1) AND ($2::uuid IS NULL OR category_id = $2)`,
      [filter.state ?? null, filter.categoryId ?? null],
    );
    const { rows } = await executor.query(
      `SELECT * FROM expense
       WHERE ($1::text IS NULL OR state = $1) AND ($2::uuid IS NULL OR category_id = $2)
       ORDER BY incurred_on DESC LIMIT $3 OFFSET $4`,
      [filter.state ?? null, filter.categoryId ?? null, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  async update(
    id: string,
    input: {
      amountPaise?: string;
      incurredOn?: string;
      vendorName?: string | null;
      description?: string | null;
      billObjectKey?: string | null;
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE expense
       SET amount_paise = COALESCE($2, amount_paise),
           incurred_on = COALESCE($3, incurred_on),
           vendor_name = COALESCE($4, vendor_name),
           description = COALESCE($5, description),
           bill_object_key = COALESCE($6, bill_object_key)
       WHERE id = $1`,
      [
        id,
        input.amountPaise ?? null,
        input.incurredOn ?? null,
        input.vendorName ?? null,
        input.description ?? null,
        input.billObjectKey ?? null,
      ],
    );
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(`UPDATE expense SET state = $2 WHERE id = $1`, [
      id,
      state,
    ]);
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE expense SET approval_request_id = $2 WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async delete(id: string, executor: Queryable): Promise<void> {
    await executor.query(`DELETE FROM expense WHERE id = $1`, [id]);
  }
}
