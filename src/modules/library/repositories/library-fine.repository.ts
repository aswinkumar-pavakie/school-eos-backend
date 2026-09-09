import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface LibraryFineRow {
  id: string;
  issueId: string;
  bookTitle: string;
  memberId: string;
  memberPersonId: string;
  memberFirstName: string;
  memberLastName: string | null;
  memberName: string;
  reason: string;
  amountPaise: string;
  assessedAt: Date;
  assessedBy: string;
  status: string;
  financeReceivableId: string | null;
  waivedBy: string | null;
  waivedReason: string | null;
  waivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FineFilter {
  status?: string;
  memberId?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `f.id, f.issue_id AS "issueId", b.title AS "bookTitle", f.member_id AS "memberId",
  m.person_id AS "memberPersonId", p.first_name AS "memberFirstName", p.last_name AS "memberLastName",
  (p.first_name || COALESCE(' ' || NULLIF(p.last_name, ''), '')) AS "memberName",
  f.reason, f.amount_paise AS "amountPaise", f.assessed_at AS "assessedAt", f.assessed_by AS "assessedBy",
  f.status, f.finance_receivable_id AS "financeReceivableId", f.waived_by AS "waivedBy",
  f.waived_reason AS "waivedReason", f.waived_at AS "waivedAt",
  f.created_at AS "createdAt", f.updated_at AS "updatedAt"`;
const FROM = `library_fine f
  JOIN library_issue i ON i.id = f.issue_id
  JOIN library_book_copy c ON c.id = i.copy_id
  JOIN library_book b ON b.id = c.book_id
  JOIN library_member m ON m.id = f.member_id
  JOIN person p ON p.id = m.person_id`;

@Injectable()
export class LibraryFineRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: FineFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: LibraryFineRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`f.status = $${params.length}`);
    }
    if (filter.memberId) {
      params.push(filter.memberId);
      conditions.push(`f.member_id = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<LibraryFineRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY f.assessed_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryFineRow | null> {
    const { rows } = await executor.query<LibraryFineRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE f.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: {
      issueId: string;
      memberId: string;
      reason: string;
      amountPaise: number | string;
      assessedBy: string;
    },
    executor: Queryable,
  ): Promise<LibraryFineRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_fine (issue_id, member_id, reason, amount_paise, assessed_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.issueId,
        input.memberId,
        input.reason,
        input.amountPaise,
        input.assessedBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async setSentToFinance(
    id: string,
    financeReceivableId: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryFineRow | null> {
    await executor.query(
      `UPDATE library_fine SET status = 'SENT_TO_FINANCE', finance_receivable_id = $2, updated_at = now() WHERE id = $1`,
      [id, financeReceivableId],
    );
    return this.findById(id, executor);
  }

  async setStatus(
    id: string,
    status: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryFineRow | null> {
    await executor.query(
      `UPDATE library_fine SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    return this.findById(id, executor);
  }

  async waive(
    id: string,
    input: { waivedBy: string; waivedReason: string },
    executor: Queryable = this.postgres,
  ): Promise<LibraryFineRow | null> {
    await executor.query(
      `UPDATE library_fine SET status = 'WAIVED', waived_by = $2, waived_reason = $3, waived_at = now(), updated_at = now() WHERE id = $1`,
      [id, input.waivedBy, input.waivedReason],
    );
    return this.findById(id, executor);
  }

  async sumPendingAmount(executor: Queryable = this.postgres): Promise<string> {
    const { rows } = await executor.query<{ total: string }>(
      `SELECT COALESCE(sum(amount_paise), 0) AS total FROM library_fine WHERE status = 'PENDING'`,
    );
    return rows[0].total;
  }

  async sumSentToFinanceAmount(
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ total: string }>(
      `SELECT COALESCE(sum(amount_paise), 0) AS total FROM library_fine WHERE status = 'SENT_TO_FINANCE'`,
    );
    return rows[0].total;
  }
}
