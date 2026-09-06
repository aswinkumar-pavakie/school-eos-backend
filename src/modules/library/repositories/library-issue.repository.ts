import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryIssueRow {
  id: string;
  copyId: string;
  copyCode: string;
  bookId: string;
  bookTitle: string;
  memberId: string;
  memberFirstName: string;
  memberLastName: string | null;
  memberName: string;
  issuedBy: string;
  issuedAt: Date;
  dueDate: string;
  returnedAt: Date | null;
  returnedTo: string | null;
  renewedCount: number;
  status: string;
  isOverdue: boolean;
  daysOverdue: number;
  /** Not a real charge yet -- a fine only exists once returned late. This is
   * daysOverdue * the current fine-per-day rate, so the dashboard/circulation
   * list can show an honest "if returned today" estimate for a still-open
   * overdue issue, without inventing a fine row that doesn't exist. */
  projectedFinePaise: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueFilter {
  status?: string;
  search?: string;
  memberId?: string;
  overdueOnly?: boolean;
  startDate?: string;
  endDate?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `i.id, i.copy_id AS "copyId", c.copy_code AS "copyCode", c.book_id AS "bookId", b.title AS "bookTitle",
  i.member_id AS "memberId", p.first_name AS "memberFirstName", p.last_name AS "memberLastName",
  (p.first_name || COALESCE(' ' || NULLIF(p.last_name, ''), '')) AS "memberName",
  i.issued_by AS "issuedBy", i.issued_at AS "issuedAt", i.due_date AS "dueDate",
  i.returned_at AS "returnedAt", i.returned_to AS "returnedTo", i.renewed_count AS "renewedCount", i.status,
  (i.status IN ('ISSUED', 'OVERDUE') AND i.due_date < current_date) AS "isOverdue",
  GREATEST(0, (current_date - i.due_date))::int AS "daysOverdue",
  (GREATEST(0, (current_date - i.due_date))::int * cfg.fine_per_day_paise) AS "projectedFinePaise",
  i.created_at AS "createdAt", i.updated_at AS "updatedAt"`;
const FROM = `library_issue i
  JOIN library_book_copy c ON c.id = i.copy_id
  JOIN library_book b ON b.id = c.book_id
  JOIN library_member m ON m.id = i.member_id
  JOIN person p ON p.id = m.person_id
  CROSS JOIN library_config cfg`;

@Injectable()
export class LibraryIssueRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Cheap self-healing flip: a GET should reflect reality even though nothing
   * touched the row since it went overdue. Batch, no per-row branching. */
  async flipOverdueRows(executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `UPDATE library_issue SET status = 'OVERDUE', updated_at = now()
       WHERE status = 'ISSUED' AND due_date < current_date`,
    );
  }

  async findMany(filter: IssueFilter, executor: Queryable = this.postgres): Promise<{ rows: LibraryIssueRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      params.push(filter.status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length}
          OR lower(b.title) LIKE $${params.length})`,
      );
    }
    if (filter.memberId) {
      params.push(filter.memberId);
      conditions.push(`i.member_id = $${params.length}`);
    }
    if (filter.overdueOnly) {
      conditions.push(`i.status IN ('ISSUED', 'OVERDUE') AND i.due_date < current_date`);
    }
    if (filter.startDate) {
      params.push(filter.startDate);
      conditions.push(`i.issued_at >= $${params.length}`);
    }
    if (filter.endDate) {
      params.push(filter.endDate);
      conditions.push(`i.issued_at < ($${params.length}::date + interval '1 day')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<LibraryIssueRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY i.issued_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryIssueRow | null> {
    const { rows } = await executor.query<LibraryIssueRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE i.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findByIdForUpdate(id: string, executor: Queryable): Promise<LibraryIssueRow | null> {
    const { rows } = await executor.query<LibraryIssueRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE i.id = $1 FOR UPDATE OF i`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** The one active (ISSUED/OVERDUE) issue for a copy, if any -- used to decide
   * whether marking a copy lost/damaged also needs to close out an issue. */
  async findActiveByCopyId(copyId: string, executor: Queryable = this.postgres): Promise<LibraryIssueRow | null> {
    const { rows } = await executor.query<LibraryIssueRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE i.copy_id = $1 AND i.status IN ('ISSUED', 'OVERDUE')`,
      [copyId],
    );
    return rows[0] ?? null;
  }

  async create(
    input: { copyId: string; memberId: string; issuedBy: string; dueDate: string },
    executor: Queryable,
  ): Promise<LibraryIssueRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_issue (copy_id, member_id, issued_by, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.copyId, input.memberId, input.issuedBy, input.dueDate],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async markReturned(id: string, returnedTo: string, executor: Queryable): Promise<LibraryIssueRow | null> {
    await executor.query(
      `UPDATE library_issue SET status = 'RETURNED', returned_at = now(), returned_to = $2, updated_at = now() WHERE id = $1`,
      [id, returnedTo],
    );
    return this.findById(id, executor);
  }

  async renew(id: string, newDueDate: string, executor: Queryable): Promise<LibraryIssueRow | null> {
    await executor.query(
      `UPDATE library_issue SET due_date = $2, renewed_count = renewed_count + 1, status = 'ISSUED', updated_at = now() WHERE id = $1`,
      [id, newDueDate],
    );
    return this.findById(id, executor);
  }

  async markLost(id: string, executor: Queryable): Promise<LibraryIssueRow | null> {
    await executor.query(`UPDATE library_issue SET status = 'LOST', updated_at = now() WHERE id = $1`, [id]);
    return this.findById(id, executor);
  }
}
