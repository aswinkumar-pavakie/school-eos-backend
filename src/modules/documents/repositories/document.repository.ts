import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface DocumentRow {
  id: string;
  ownerDomain: string;
  ownerObjectType: string;
  ownerObjectId: string;
  category: string;
  docType: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  checksumSha256: string | null;
  isRestricted: boolean;
  uploadedBy: string | null;
  uploadedAt: Date;
  retainUntil: string | null;
  purgedAt: Date | null;
  status: string;
}

export interface CreateDocumentInput {
  ownerDomain: string;
  ownerObjectType: string;
  ownerObjectId: string;
  category: string;
  docType: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  isRestricted?: boolean;
  uploadedBy?: string | null;
  retainUntil?: string | null;
}

export interface DocumentFilter {
  ownerObjectType?: string;
  ownerObjectId?: string;
  category?: string;
  status?: string;
}

const COLUMNS = `id, owner_domain AS "ownerDomain", owner_object_type AS "ownerObjectType",
  owner_object_id AS "ownerObjectId", category, doc_type AS "docType", object_key AS "objectKey",
  file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes",
  checksum_sha256 AS "checksumSha256", is_restricted AS "isRestricted", uploaded_by AS "uploadedBy",
  uploaded_at AS "uploadedAt", retain_until AS "retainUntil", purged_at AS "purgedAt", status`;

@Injectable()
export class DocumentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(filter: DocumentFilter, executor: Queryable = this.postgres): Promise<DocumentRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.ownerObjectType) {
      params.push(filter.ownerObjectType);
      conditions.push(`owner_object_type = $${params.length}`);
    }
    if (filter.ownerObjectId) {
      params.push(filter.ownerObjectId);
      conditions.push(`owner_object_id = $${params.length}`);
    }
    if (filter.category) {
      params.push(filter.category);
      conditions.push(`category = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<DocumentRow>(
      `SELECT ${COLUMNS} FROM document ${where} ORDER BY uploaded_at DESC`,
      params,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<DocumentRow | null> {
    const { rows } = await executor.query<DocumentRow>(`SELECT ${COLUMNS} FROM document WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateDocumentInput, executor: Queryable = this.postgres): Promise<DocumentRow> {
    const { rows } = await executor.query<DocumentRow>(
      `INSERT INTO document
         (owner_domain, owner_object_type, owner_object_id, category, doc_type, object_key,
          file_name, mime_type, size_bytes, checksum_sha256, is_restricted, uploaded_by, retain_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, false), $12, $13)
       RETURNING ${COLUMNS}`,
      [
        input.ownerDomain,
        input.ownerObjectType,
        input.ownerObjectId,
        input.category,
        input.docType,
        input.objectKey,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.checksumSha256 ?? null,
        input.isRestricted ?? null,
        input.uploadedBy ?? null,
        input.retainUntil ?? null,
      ],
    );
    return rows[0];
  }

  async purge(id: string, executor: Queryable = this.postgres): Promise<DocumentRow | null> {
    const { rows } = await executor.query<DocumentRow>(
      `UPDATE document SET status = 'PURGED', purged_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  }
}
