// Current Term (LMS) -- classwork/task, always scoped to one real class
// (subject_offering) at a time. Same subject + same faculty teaching two
// different sections gets two genuinely separate task lists.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LmsTaskRow {
  id: string;
  subjectOfferingId: string;
  createdBy: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  attachmentObjectKey: string | null;
  attachmentFileName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): LmsTaskRow {
  return {
    id: row.id,
    subjectOfferingId: row.subject_offering_id,
    createdBy: row.created_by,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    attachmentObjectKey: row.attachment_object_key,
    attachmentFileName: row.attachment_file_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `id, subject_offering_id, created_by, title, description, due_date,
  attachment_object_key, attachment_file_name, status, created_at, updated_at`;

@Injectable()
export class LmsTaskRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForOffering(subjectOfferingId: string, executor: Queryable = this.postgres): Promise<LmsTaskRow[]> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM lms_task WHERE subject_offering_id = $1 ORDER BY created_at DESC`, [
      subjectOfferingId,
    ]);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LmsTaskRow | null> {
    const { rows } = await executor.query(`SELECT ${COLUMNS} FROM lms_task WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: {
      subjectOfferingId: string;
      createdBy: string;
      title: string;
      description: string | null;
      dueDate: string | null;
      attachmentObjectKey: string | null;
      attachmentFileName: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO lms_task (subject_offering_id, created_by, title, description, due_date, attachment_object_key, attachment_file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.subjectOfferingId, input.createdBy, input.title, input.description, input.dueDate, input.attachmentObjectKey, input.attachmentFileName],
    );
    return rows[0].id;
  }

  async update(
    id: string,
    input: Partial<{ title: string; description: string | null; dueDate: string | null; status: string }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) push('title', input.title);
    if (input.description !== undefined) push('description', input.description);
    if (input.dueDate !== undefined) push('due_date', input.dueDate);
    if (input.status !== undefined) push('status', input.status);
    if (sets.length === 0) return;
    params.push(id);
    await executor.query(`UPDATE lms_task SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM lms_task WHERE id = $1`, [id]);
  }
}
