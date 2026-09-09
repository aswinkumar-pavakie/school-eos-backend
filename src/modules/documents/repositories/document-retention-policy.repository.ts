import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface DocumentRetentionPolicyRow {
  category: string;
  description: string;
  retentionYears: number | null;
  anchor: string;
  isPermanent: boolean;
  isRestricted: boolean;
  graceDays: number;
}

export interface CreateDocumentRetentionPolicyInput {
  category: string;
  description: string;
  retentionYears?: number | null;
  anchor: string;
  isPermanent?: boolean;
  isRestricted?: boolean;
  graceDays?: number;
}

export interface UpdateDocumentRetentionPolicyInput {
  description?: string;
  /** These two always travel together, resolved by the service (never independently
   * COALESCE-able -- the DB requires exactly one of "permanent" or "has a
   * retention_years number", so a partial update could otherwise leave them
   * inconsistent). Omit both to leave the existing permanence state untouched. */
  retentionYears?: number | null;
  isPermanent?: boolean;
  anchor?: string;
  isRestricted?: boolean;
  graceDays?: number;
}

const COLUMNS = `category, description, retention_years AS "retentionYears", anchor,
  is_permanent AS "isPermanent", is_restricted AS "isRestricted", grace_days AS "graceDays"`;

@Injectable()
export class DocumentRetentionPolicyRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    executor: Queryable = this.postgres,
  ): Promise<DocumentRetentionPolicyRow[]> {
    const { rows } = await executor.query<DocumentRetentionPolicyRow>(
      `SELECT ${COLUMNS} FROM document_retention_policy ORDER BY category`,
    );
    return rows;
  }

  async findByCategory(
    category: string,
    executor: Queryable = this.postgres,
  ): Promise<DocumentRetentionPolicyRow | null> {
    const { rows } = await executor.query<DocumentRetentionPolicyRow>(
      `SELECT ${COLUMNS} FROM document_retention_policy WHERE category = $1`,
      [category],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateDocumentRetentionPolicyInput,
    executor: Queryable = this.postgres,
  ): Promise<DocumentRetentionPolicyRow> {
    const { rows } = await executor.query<DocumentRetentionPolicyRow>(
      `INSERT INTO document_retention_policy
         (category, description, retention_years, anchor, is_permanent, is_restricted, grace_days)
       VALUES ($1, $2, $3, $4, COALESCE($5, false), COALESCE($6, false), COALESCE($7, 90))
       RETURNING ${COLUMNS}`,
      [
        input.category,
        input.description,
        input.retentionYears ?? null,
        input.anchor,
        input.isPermanent ?? null,
        input.isRestricted ?? null,
        input.graceDays ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    category: string,
    input: UpdateDocumentRetentionPolicyInput,
    executor: Queryable = this.postgres,
  ): Promise<DocumentRetentionPolicyRow | null> {
    // retention_years/is_permanent are set directly (not COALESCEd against each
    // other) whenever either is provided, so the pair always lands consistent --
    // see the interface doc above.
    const touchesPermanence =
      input.retentionYears !== undefined || input.isPermanent !== undefined;
    const { rows } = await executor.query<DocumentRetentionPolicyRow>(
      `UPDATE document_retention_policy SET
         description = COALESCE($2, description),
         retention_years = CASE WHEN $3 THEN $4 ELSE retention_years END,
         is_permanent = CASE WHEN $3 THEN $5 ELSE is_permanent END,
         anchor = COALESCE($6, anchor),
         is_restricted = COALESCE($7, is_restricted),
         grace_days = COALESCE($8, grace_days),
         updated_at = now()
       WHERE category = $1
       RETURNING ${COLUMNS}`,
      [
        category,
        input.description ?? null,
        touchesPermanence,
        input.retentionYears ?? null,
        input.isPermanent ?? false,
        input.anchor ?? null,
        input.isRestricted ?? null,
        input.graceDays ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
