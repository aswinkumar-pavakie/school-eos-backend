import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface LibraryEbookRow {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  language: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  coverImageUrl: string | null;
  resourceUrl: string;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEbookInput {
  title: string;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  categoryId?: string | null;
  language?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  resourceUrl: string;
  createdBy?: string | null;
}

export interface UpdateEbookInput {
  title?: string;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  categoryId?: string | null;
  language?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  resourceUrl?: string;
}

export interface EbookFilter {
  search?: string;
  categoryId?: string;
  status?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `e.id, e.title, e.author, e.publisher, e.edition, e.language, e.description,
  e.category_id AS "categoryId", cat.name AS "categoryName", e.cover_image_url AS "coverImageUrl",
  e.resource_url AS "resourceUrl",
  e.status, e.created_by AS "createdBy", e.created_at AS "createdAt", e.updated_at AS "updatedAt"`;
const FROM = `library_ebook e LEFT JOIN library_category cat ON cat.id = e.category_id`;

@Injectable()
export class LibraryEbookRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: EbookFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: LibraryEbookRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(e.title) LIKE $${params.length} OR lower(coalesce(e.author, '')) LIKE $${params.length})`,
      );
    }
    if (filter.categoryId) {
      params.push(filter.categoryId);
      conditions.push(`e.category_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`e.status = $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<LibraryEbookRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY e.title
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryEbookRow | null> {
    const { rows } = await executor.query<LibraryEbookRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE e.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateEbookInput,
    executor: Queryable = this.postgres,
  ): Promise<LibraryEbookRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_ebook
         (title, author, publisher, edition, category_id, language, description, cover_image_url, resource_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.title,
        input.author ?? null,
        input.publisher ?? null,
        input.edition ?? null,
        input.categoryId ?? null,
        input.language ?? null,
        input.description ?? null,
        input.coverImageUrl ?? null,
        input.resourceUrl,
        input.createdBy ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdateEbookInput,
    executor: Queryable = this.postgres,
  ): Promise<LibraryEbookRow | null> {
    await executor.query(
      `UPDATE library_ebook SET
         title = COALESCE($2, title),
         author = COALESCE($3, author),
         publisher = COALESCE($4, publisher),
         edition = COALESCE($5, edition),
         category_id = COALESCE($6, category_id),
         language = COALESCE($7, language),
         description = COALESCE($8, description),
         cover_image_url = COALESCE($9, cover_image_url),
         resource_url = COALESCE($10, resource_url),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.title ?? null,
        input.author ?? null,
        input.publisher ?? null,
        input.edition ?? null,
        input.categoryId ?? null,
        input.language ?? null,
        input.description ?? null,
        input.coverImageUrl ?? null,
        input.resourceUrl ?? null,
      ],
    );
    return this.findById(id, executor);
  }

  async setStatus(
    id: string,
    status: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryEbookRow | null> {
    await executor.query(
      `UPDATE library_ebook SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    return this.findById(id, executor);
  }
}
