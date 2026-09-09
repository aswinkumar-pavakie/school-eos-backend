import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryLostDamagedReportRow {
  id: string;
  copyId: string;
  copyCode: string;
  bookId: string;
  bookTitle: string;
  /** The copy's CURRENT live status -- not stored here, joined from
   * library_book_copy. This row is an immutable incident log entry; the copy
   * itself remains the one authoritative status. */
  currentCopyStatus: string;
  issueId: string | null;
  memberId: string | null;
  memberName: string | null;
  type: string;
  reason: string | null;
  notes: string | null;
  fineId: string | null;
  fineStatus: string | null;
  fineAmountPaise: string | null;
  reportedBy: string;
  reportedByName: string;
  reportedAt: Date;
  createdAt: Date;
}

export interface LostDamagedFilter {
  type?: string;
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `r.id, r.copy_id AS "copyId", c.copy_code AS "copyCode", c.book_id AS "bookId", b.title AS "bookTitle",
  c.status AS "currentCopyStatus",
  r.issue_id AS "issueId", r.member_id AS "memberId",
  (mp.first_name || COALESCE(' ' || NULLIF(mp.last_name, ''), '')) AS "memberName",
  r.type, r.reason, r.notes,
  r.fine_id AS "fineId", f.status AS "fineStatus", f.amount_paise AS "fineAmountPaise",
  r.reported_by AS "reportedBy",
  (rp.first_name || COALESCE(' ' || NULLIF(rp.last_name, ''), '')) AS "reportedByName",
  r.reported_at AS "reportedAt", r.created_at AS "createdAt"`;
const FROM = `library_lost_damaged_report r
  JOIN library_book_copy c ON c.id = r.copy_id
  JOIN library_book b ON b.id = c.book_id
  JOIN person rp ON rp.id = r.reported_by
  LEFT JOIN library_member m ON m.id = r.member_id
  LEFT JOIN person mp ON mp.id = m.person_id
  LEFT JOIN library_fine f ON f.id = r.fine_id`;

@Injectable()
export class LibraryLostDamagedReportRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      copyId: string;
      issueId: string | null;
      memberId: string | null;
      type: 'LOST' | 'DAMAGED';
      reason: string | null;
      notes: string | null;
      fineId: string | null;
      reportedBy: string;
    },
    executor: Queryable,
  ): Promise<LibraryLostDamagedReportRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_lost_damaged_report
         (copy_id, issue_id, member_id, type, reason, notes, fine_id, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [input.copyId, input.issueId, input.memberId, input.type, input.reason, input.notes, input.fineId, input.reportedBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findMany(
    filter: LostDamagedFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: LibraryLostDamagedReportRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      params.push(filter.type);
      conditions.push(`r.type = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(b.title) LIKE $${params.length} OR lower(mp.first_name) LIKE $${params.length}
          OR lower(coalesce(mp.last_name, '')) LIKE $${params.length})`,
      );
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(`SELECT count(*) FROM ${FROM} ${where}`, params);
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<LibraryLostDamagedReportRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY r.reported_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryLostDamagedReportRow | null> {
    const { rows } = await executor.query<LibraryLostDamagedReportRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1`, [id]);
    return rows[0] ?? null;
  }
}
