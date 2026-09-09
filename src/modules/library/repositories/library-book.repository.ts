import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryBookRow {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
  categoryId: string | null;
  categoryName: string | null;
  publicationYear: number | null;
  language: string | null;
  description: string | null;
  coverImageUrl: string | null;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Only present on list rows -- the single-book GET uses the richer
 * findCopiesSummary() below instead (also covers Under Repair/Retired, which
 * this cheaper per-row aggregate deliberately doesn't -- the list table only
 * needs the three numbers it actually renders). */
export interface ListCopiesSummary {
  total: number;
  available: number;
  issued: number;
}

export interface LibraryBookListRow extends LibraryBookRow {
  copiesSummary: ListCopiesSummary;
}

export interface CopiesSummary {
  total: number;
  available: number;
  issued: number;
  lost: number;
  damaged: number;
  underRepair: number;
  retired: number;
}

export interface CreateBookInput {
  title: string;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  categoryId?: string | null;
  publicationYear?: number | null;
  language?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  createdBy?: string | null;
}

export interface UpdateBookInput {
  title?: string;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  categoryId?: string | null;
  publicationYear?: number | null;
  language?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
}

export interface BookFilter {
  search?: string;
  categoryId?: string;
  author?: string;
  publisher?: string;
  status?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `b.id, b.title, b.author, b.isbn, b.publisher, b.edition,
  b.category_id AS "categoryId", cat.name AS "categoryName", b.publication_year AS "publicationYear",
  b.language, b.description, b.cover_image_url AS "coverImageUrl", b.status, b.created_by AS "createdBy",
  b.created_at AS "createdAt", b.updated_at AS "updatedAt"`;
const FROM = `library_book b LEFT JOIN library_category cat ON cat.id = b.category_id`;

@Injectable()
export class LibraryBookRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(filter: BookFilter, executor: Queryable = this.postgres): Promise<{ rows: LibraryBookListRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(b.title) LIKE $${params.length} OR lower(coalesce(b.author, '')) LIKE $${params.length} OR lower(coalesce(b.isbn, '')) LIKE $${params.length})`,
      );
    }
    if (filter.categoryId) {
      params.push(filter.categoryId);
      conditions.push(`b.category_id = $${params.length}`);
    }
    if (filter.author) {
      params.push(`%${filter.author.toLowerCase()}%`);
      conditions.push(`lower(coalesce(b.author, '')) LIKE $${params.length}`);
    }
    if (filter.publisher) {
      params.push(`%${filter.publisher.toLowerCase()}%`);
      conditions.push(`lower(coalesce(b.publisher, '')) LIKE $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`b.status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<LibraryBookRow & { copiesTotal: string; copiesAvailable: string; copiesIssued: string }>(
      `SELECT ${COLUMNS},
              COALESCE(cs.total, 0) AS "copiesTotal",
              COALESCE(cs.available, 0) AS "copiesAvailable",
              COALESCE(cs.issued, 0) AS "copiesIssued"
       FROM ${FROM}
       LEFT JOIN LATERAL (
         SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'AVAILABLE') AS available,
                count(*) FILTER (WHERE status = 'ISSUED') AS issued
         FROM library_book_copy WHERE book_id = b.id
       ) cs ON true
       ${where}
       ORDER BY b.title
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return {
      rows: rows.map(({ copiesTotal, copiesAvailable, copiesIssued, ...book }) => ({
        ...book,
        copiesSummary: {
          total: Number(copiesTotal),
          available: Number(copiesAvailable),
          issued: Number(copiesIssued),
        },
      })),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryBookRow | null> {
    const { rows } = await executor.query<LibraryBookRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE b.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findCopiesSummary(bookId: string, executor: Queryable = this.postgres): Promise<CopiesSummary> {
    const { rows } = await executor.query<{
      total: string;
      available: string;
      issued: string;
      lost: string;
      damaged: string;
      underRepair: string;
      retired: string;
    }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE status = 'AVAILABLE') AS available,
              count(*) FILTER (WHERE status = 'ISSUED') AS issued,
              count(*) FILTER (WHERE status = 'LOST') AS lost,
              count(*) FILTER (WHERE status = 'DAMAGED') AS damaged,
              count(*) FILTER (WHERE status = 'UNDER_REPAIR') AS "underRepair",
              count(*) FILTER (WHERE status = 'RETIRED') AS retired
       FROM library_book_copy WHERE book_id = $1`,
      [bookId],
    );
    const row = rows[0];
    return {
      total: parseInt(row.total, 10),
      available: parseInt(row.available, 10),
      issued: parseInt(row.issued, 10),
      lost: parseInt(row.lost, 10),
      damaged: parseInt(row.damaged, 10),
      underRepair: parseInt(row.underRepair, 10),
      retired: parseInt(row.retired, 10),
    };
  }

  async create(input: CreateBookInput, executor: Queryable = this.postgres): Promise<LibraryBookRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_book (title, author, isbn, publisher, edition, category_id, publication_year, language, description, cover_image_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        input.title,
        input.author ?? null,
        input.isbn ?? null,
        input.publisher ?? null,
        input.edition ?? null,
        input.categoryId ?? null,
        input.publicationYear ?? null,
        input.language ?? null,
        input.description ?? null,
        input.coverImageUrl ?? null,
        input.createdBy ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(id: string, input: UpdateBookInput, executor: Queryable = this.postgres): Promise<LibraryBookRow | null> {
    await executor.query(
      `UPDATE library_book SET
         title = COALESCE($2, title),
         author = COALESCE($3, author),
         isbn = COALESCE($4, isbn),
         publisher = COALESCE($5, publisher),
         edition = COALESCE($6, edition),
         category_id = COALESCE($7, category_id),
         publication_year = COALESCE($8, publication_year),
         language = COALESCE($9, language),
         description = COALESCE($10, description),
         cover_image_url = COALESCE($11, cover_image_url),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.title ?? null,
        input.author ?? null,
        input.isbn ?? null,
        input.publisher ?? null,
        input.edition ?? null,
        input.categoryId ?? null,
        input.publicationYear ?? null,
        input.language ?? null,
        input.description ?? null,
        input.coverImageUrl ?? null,
      ],
    );
    return this.findById(id, executor);
  }

  async setStatus(id: string, status: string, executor: Queryable = this.postgres): Promise<LibraryBookRow | null> {
    await executor.query(`UPDATE library_book SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
    return this.findById(id, executor);
  }
}
