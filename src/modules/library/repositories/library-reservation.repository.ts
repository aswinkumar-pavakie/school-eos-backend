import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryReservationRow {
  id: string;
  bookId: string;
  bookTitle: string;
  memberId: string;
  memberFirstName: string;
  memberLastName: string | null;
  memberName: string;
  reservedAt: Date;
  status: string;
  /** Only meaningful while PENDING -- 1-based position in the FIFO queue for
   * this book. Null once READY/FULFILLED/CANCELLED/EXPIRED, since queue
   * position stops meaning anything at that point. */
  queuePosition: number | null;
  readyAt: Date | null;
  fulfilledIssueId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationFilter {
  status?: string;
  bookId?: string;
  memberId?: string;
  search?: string;
}

const COLUMNS = `r.id, r.book_id AS "bookId", b.title AS "bookTitle", r.member_id AS "memberId",
  p.first_name AS "memberFirstName", p.last_name AS "memberLastName",
  (p.first_name || COALESCE(' ' || NULLIF(p.last_name, ''), '')) AS "memberName",
  r.reserved_at AS "reservedAt", r.status,
  (CASE WHEN r.status = 'PENDING' THEN (
     SELECT count(*)::int FROM library_reservation r2
     WHERE r2.book_id = r.book_id AND r2.status = 'PENDING' AND r2.reserved_at <= r.reserved_at
   ) END) AS "queuePosition",
  r.ready_at AS "readyAt",
  r.fulfilled_issue_id AS "fulfilledIssueId",
  r.expires_at AS "expiresAt", r.created_at AS "createdAt", r.updated_at AS "updatedAt"`;
const FROM = `library_reservation r
  JOIN library_book b ON b.id = r.book_id
  JOIN library_member m ON m.id = r.member_id
  JOIN person p ON p.id = m.person_id`;

@Injectable()
export class LibraryReservationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(filter: ReservationFilter, executor: Queryable = this.postgres): Promise<LibraryReservationRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (filter.bookId) {
      params.push(filter.bookId);
      conditions.push(`r.book_id = $${params.length}`);
    }
    if (filter.memberId) {
      params.push(filter.memberId);
      conditions.push(`r.member_id = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length} OR lower(b.title) LIKE $${params.length})`,
      );
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<LibraryReservationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where} ORDER BY r.reserved_at`,
      params,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryReservationRow | null> {
    const { rows } = await executor.query<LibraryReservationRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Row-locking read, for use right before a status transition that must not
   * race with a concurrent cancel/fulfil/expire on the same reservation. */
  async findByIdForUpdate(id: string, executor: Queryable): Promise<LibraryReservationRow | null> {
    const { rows } = await executor.query<LibraryReservationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1 FOR UPDATE OF r`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Oldest pending reservation for a book -- FIFO fulfilment order. This is
   * the *next in line*, not yet holding a copy. */
  async findOldestPendingForBook(bookId: string, executor: Queryable = this.postgres): Promise<LibraryReservationRow | null> {
    const { rows } = await executor.query<LibraryReservationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.book_id = $1 AND r.status = 'PENDING' ORDER BY r.reserved_at LIMIT 1`,
      [bookId],
    );
    return rows[0] ?? null;
  }

  /** The (at most one) reservation currently holding a copy for a book. */
  async findReadyForBook(bookId: string, executor: Queryable = this.postgres): Promise<LibraryReservationRow | null> {
    const { rows } = await executor.query<LibraryReservationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.book_id = $1 AND r.status = 'READY' LIMIT 1`,
      [bookId],
    );
    return rows[0] ?? null;
  }

  /** READY reservations whose hold window (ready_at + library_config.reservation_hold_days)
   * has already passed -- the self-healing lazy-expire set, same idea as
   * library-issue.repository.ts's flipOverdueRows(). Row-locked since the
   * caller expires each one inside a transaction alongside its copy. */
  async findExpiredReady(executor: Queryable = this.postgres): Promise<LibraryReservationRow[]> {
    const { rows } = await executor.query<LibraryReservationRow>(
      `SELECT ${COLUMNS} FROM ${FROM}
       CROSS JOIN library_config cfg
       WHERE r.status = 'READY'
         AND r.ready_at + (cfg.reservation_hold_days || ' days')::interval < now()`,
    );
    return rows;
  }

  /** Any not-yet-resolved reservation (PENDING or READY) for this member+book --
   * used to reject a duplicate reservation attempt regardless of which of the
   * two active states the existing one is in. */
  async findActiveForMemberAndBook(
    memberId: string,
    bookId: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryReservationRow | null> {
    const { rows } = await executor.query<LibraryReservationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.member_id = $1 AND r.book_id = $2 AND r.status IN ('PENDING', 'READY')`,
      [memberId, bookId],
    );
    return rows[0] ?? null;
  }

  async create(bookId: string, memberId: string, executor: Queryable = this.postgres): Promise<LibraryReservationRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_reservation (book_id, member_id) VALUES ($1, $2) RETURNING id`,
      [bookId, memberId],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  /** PENDING -> READY: the copy is now held for this reservation specifically.
   * expires_at is set from the current library_config.reservation_hold_days so
   * it never has to be recomputed client-side. */
  async markReady(id: string, executor: Queryable): Promise<LibraryReservationRow | null> {
    await executor.query(
      `UPDATE library_reservation r SET
         status = 'READY',
         ready_at = now(),
         expires_at = now() + (
           SELECT (cfg.reservation_hold_days || ' days')::interval FROM library_config cfg
         ),
         updated_at = now()
       WHERE r.id = $1`,
      [id],
    );
    return this.findById(id, executor);
  }

  async setStatus(
    id: string,
    status: string,
    fulfilledIssueId: string | null,
    executor: Queryable = this.postgres,
  ): Promise<LibraryReservationRow | null> {
    await executor.query(
      `UPDATE library_reservation SET status = $2, fulfilled_issue_id = COALESCE($3, fulfilled_issue_id), updated_at = now() WHERE id = $1`,
      [id, status, fulfilledIssueId],
    );
    return this.findById(id, executor);
  }
}
