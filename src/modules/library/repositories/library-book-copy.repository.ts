import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryBookCopyRow {
  id: string;
  bookId: string;
  bookTitle: string;
  copyCode: string;
  shelfLocation: string | null;
  status: string;
  acquisitionDate: string | null;
  acquisitionCostPaise: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCopyInput {
  bookId: string;
  copyCode: string;
  shelfLocation?: string | null;
  acquisitionDate?: string | null;
  acquisitionCostPaise?: number | null;
}

export interface UpdateCopyInput {
  copyCode?: string;
  shelfLocation?: string | null;
  acquisitionDate?: string | null;
  acquisitionCostPaise?: number | null;
}

const COLUMNS = `c.id, c.book_id AS "bookId", b.title AS "bookTitle", c.copy_code AS "copyCode",
  c.shelf_location AS "shelfLocation", c.status, c.acquisition_date AS "acquisitionDate",
  c.acquisition_cost_paise AS "acquisitionCostPaise", c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
const FROM = `library_book_copy c JOIN library_book b ON b.id = c.book_id`;

@Injectable()
export class LibraryBookCopyRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByBookId(bookId: string, executor: Queryable = this.postgres): Promise<LibraryBookCopyRow[]> {
    const { rows } = await executor.query<LibraryBookCopyRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE c.book_id = $1 ORDER BY c.copy_code`,
      [bookId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryBookCopyRow | null> {
    const { rows } = await executor.query<LibraryBookCopyRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE c.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Row-locking read, for use inside a transaction right before a status change
   * that must not race with a concurrent issue/return/mark-lost on the same copy. */
  async findByIdForUpdate(id: string, executor: Queryable): Promise<LibraryBookCopyRow | null> {
    const { rows } = await executor.query<LibraryBookCopyRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE c.id = $1 FOR UPDATE OF c`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateCopyInput, executor: Queryable = this.postgres): Promise<LibraryBookCopyRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_book_copy (book_id, copy_code, shelf_location, acquisition_date, acquisition_cost_paise)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.bookId,
        input.copyCode,
        input.shelfLocation ?? null,
        input.acquisitionDate ?? null,
        input.acquisitionCostPaise ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(id: string, input: UpdateCopyInput, executor: Queryable = this.postgres): Promise<LibraryBookCopyRow | null> {
    await executor.query(
      `UPDATE library_book_copy SET
         copy_code = COALESCE($2, copy_code),
         shelf_location = COALESCE($3, shelf_location),
         acquisition_date = COALESCE($4, acquisition_date),
         acquisition_cost_paise = COALESCE($5, acquisition_cost_paise),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.copyCode ?? null,
        input.shelfLocation ?? null,
        input.acquisitionDate ?? null,
        input.acquisitionCostPaise ?? null,
      ],
    );
    return this.findById(id, executor);
  }

  async setStatus(id: string, status: string, executor: Queryable): Promise<LibraryBookCopyRow | null> {
    await executor.query(`UPDATE library_book_copy SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
    return this.findById(id, executor);
  }

  /** Used to reject a reservation when the book already has a copy on the
   * shelf -- no one needs to queue for a book that's just sitting there
   * available. */
  async countAvailableForBook(bookId: string, executor: Queryable = this.postgres): Promise<number> {
    const { rows } = await executor.query<{ count: string }>(
      `SELECT count(*) FROM library_book_copy WHERE book_id = $1 AND status = 'AVAILABLE'`,
      [bookId],
    );
    return parseInt(rows[0].count, 10);
  }

  /** The copy (at most one, by the partial-unique-index-equivalent business
   * rule this module maintains) currently held for a book's reservation queue. */
  async findOneByBookAndStatus(
    bookId: string,
    status: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryBookCopyRow | null> {
    const { rows } = await executor.query<LibraryBookCopyRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE c.book_id = $1 AND c.status = $2 LIMIT 1`,
      [bookId, status],
    );
    return rows[0] ?? null;
  }
}
