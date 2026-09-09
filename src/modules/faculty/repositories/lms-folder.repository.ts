// Current Term (LMS) -- Materials sub-folders (e.g. "Unit 1") owned by one
// staff member for one subject, each with its own editable "share with these
// classes" list (subject_offering ids -- always a subset of that same
// staff+subject's own real teaching assignments, validated in the service,
// never trusted from the client) and its own uploaded files.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LmsFolderRow {
  id: string;
  staffId: string;
  subjectId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LmsFileRow {
  id: string;
  folderId: string;
  fileName: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: string;
  uploadedBy: string;
  uploadedAt: Date;
}

@Injectable()
export class LmsFolderRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForStaffSubject(staffId: string, subjectId: string, executor: Queryable = this.postgres): Promise<LmsFolderRow[]> {
    const { rows } = await executor.query(
      `SELECT id, staff_id, subject_id, title, description, created_at, updated_at
       FROM lms_folder WHERE staff_id = $1 AND subject_id = $2 ORDER BY created_at`,
      [staffId, subjectId],
    );
    return rows.map(mapFolder);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LmsFolderRow | null> {
    const { rows } = await executor.query(
      `SELECT id, staff_id, subject_id, title, description, created_at, updated_at FROM lms_folder WHERE id = $1`,
      [id],
    );
    return rows.length ? mapFolder(rows[0]) : null;
  }

  async create(
    input: { staffId: string; subjectId: string; title: string; description: string | null },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO lms_folder (staff_id, subject_id, title, description) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.staffId, input.subjectId, input.title, input.description],
    );
    return rows[0].id;
  }

  async update(id: string, input: Partial<{ title: string; description: string | null }>, executor: Queryable = this.postgres): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) push('title', input.title);
    if (input.description !== undefined) push('description', input.description);
    if (sets.length === 0) return;
    params.push(id);
    await executor.query(`UPDATE lms_folder SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  }

  /** Cascades to lms_folder_share and lms_file automatically. */
  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM lms_folder WHERE id = $1`, [id]);
  }

  async findShareOfferingIds(folderId: string, executor: Queryable = this.postgres): Promise<string[]> {
    const { rows } = await executor.query(`SELECT subject_offering_id FROM lms_folder_share WHERE folder_id = $1`, [folderId]);
    return rows.map((r: any) => r.subject_offering_id);
  }

  /** Replaces the whole share list in one go -- simplest correct semantics
   * for "edit the folder and change which classes it's shared with". */
  async setShares(folderId: string, subjectOfferingIds: string[], executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM lms_folder_share WHERE folder_id = $1`, [folderId]);
    for (const offeringId of subjectOfferingIds) {
      await executor.query(`INSERT INTO lms_folder_share (folder_id, subject_offering_id) VALUES ($1, $2)`, [folderId, offeringId]);
    }
  }

  async findFiles(folderId: string, executor: Queryable = this.postgres): Promise<LmsFileRow[]> {
    const { rows } = await executor.query(
      `SELECT id, folder_id, file_name, object_key, mime_type, size_bytes, uploaded_by, uploaded_at
       FROM lms_file WHERE folder_id = $1 ORDER BY uploaded_at DESC`,
      [folderId],
    );
    return rows.map(mapFile);
  }

  async findFileById(id: string, executor: Queryable = this.postgres): Promise<(LmsFileRow & { staffId: string }) | null> {
    const { rows } = await executor.query(
      `SELECT f.id, f.folder_id, f.file_name, f.object_key, f.mime_type, f.size_bytes, f.uploaded_by, f.uploaded_at, lf.staff_id
       FROM lms_file f JOIN lms_folder lf ON lf.id = f.folder_id WHERE f.id = $1`,
      [id],
    );
    if (!rows.length) return null;
    return { ...mapFile(rows[0]), staffId: rows[0].staff_id };
  }

  async createFile(
    input: { folderId: string; fileName: string; objectKey: string; mimeType: string; sizeBytes: number; uploadedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO lms_file (folder_id, file_name, object_key, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.folderId, input.fileName, input.objectKey, input.mimeType, input.sizeBytes, input.uploadedBy],
    );
    return rows[0].id;
  }

  async deleteFile(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM lms_file WHERE id = $1`, [id]);
  }
}

function mapFolder(row: any): LmsFolderRow {
  return {
    id: row.id,
    staffId: row.staff_id,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFile(row: any): LmsFileRow {
  return {
    id: row.id,
    folderId: row.folder_id,
    fileName: row.file_name,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}
