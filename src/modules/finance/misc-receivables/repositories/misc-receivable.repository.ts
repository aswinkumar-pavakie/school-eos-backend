import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface MiscReceivableRow {
  id: string;
  sourceModule: string;
  sourceReferenceId: string;
  personId: string;
  personFirstName: string;
  personLastName: string | null;
  description: string;
  amountPaise: string;
  paidPaise: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReceivableInput {
  sourceModule: string;
  sourceReferenceId: string;
  personId: string;
  description: string;
  amountPaise: number | string;
}

export interface ReceivableFilter {
  status?: string;
  sourceModule?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `r.id, r.source_module AS "sourceModule", r.source_reference_id AS "sourceReferenceId",
  r.person_id AS "personId", p.first_name AS "personFirstName", p.last_name AS "personLastName",
  r.description, r.amount_paise AS "amountPaise", r.paid_paise AS "paidPaise", r.status,
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"`;
const FROM = `finance_misc_receivable r JOIN person p ON p.id = r.person_id`;

@Injectable()
export class MiscReceivableRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: ReceivableFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: MiscReceivableRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (filter.sourceModule) {
      params.push(filter.sourceModule);
      conditions.push(`r.source_module = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<MiscReceivableRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<MiscReceivableRow | null> {
    const { rows } = await executor.query<MiscReceivableRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<MiscReceivableRow | null> {
    const { rows } = await executor.query<MiscReceivableRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1 FOR UPDATE OF r`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateReceivableInput,
    executor: Queryable = this.postgres,
  ): Promise<MiscReceivableRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO finance_misc_receivable (source_module, source_reference_id, person_id, description, amount_paise)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.sourceModule,
        input.sourceReferenceId,
        input.personId,
        input.description,
        input.amountPaise,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async recordPayment(
    receivableId: string,
    input: {
      amountPaise: number | string;
      mode: string;
      collectedBy: string;
      idempotencyKey: string;
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO finance_misc_receivable_payment (receivable_id, amount_paise, mode, collected_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        receivableId,
        input.amountPaise,
        input.mode,
        input.collectedBy,
        input.idempotencyKey,
      ],
    );
  }

  async applyPayment(
    receivableId: string,
    amountPaise: number | string,
    executor: Queryable,
  ): Promise<MiscReceivableRow> {
    await executor.query(
      `UPDATE finance_misc_receivable SET
         paid_paise = paid_paise + $2,
         status = CASE WHEN paid_paise + $2 >= amount_paise THEN 'PAID' ELSE 'PARTIAL' END,
         updated_at = now()
       WHERE id = $1`,
      [receivableId, amountPaise],
    );
    return (await this.findById(receivableId, executor))!;
  }
}
