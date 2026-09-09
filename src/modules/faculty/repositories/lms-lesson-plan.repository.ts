// Current Term (LMS) -- lesson plan, same per-class (subject_offering)
// scoping as Task.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface LmsLessonPlanRow {
  id: string;
  subjectOfferingId: string;
  createdBy: string;
  title: string;
  content: string;
  weekStart: string | null;
  attachmentObjectKey: string | null;
  attachmentFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): LmsLessonPlanRow {
  return {
    id: row.id,
    subjectOfferingId: row.subject_offering_id,
    createdBy: row.created_by,
    title: row.title,
    content: row.content,
    weekStart: row.week_start,
    attachmentObjectKey: row.attachment_object_key,
    attachmentFileName: row.attachment_file_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `id, subject_offering_id, created_by, title, content, week_start,
  attachment_object_key, attachment_file_name, created_at, updated_at`;

@Injectable()
export class LmsLessonPlanRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForOffering(
    subjectOfferingId: string,
    executor: Queryable = this.postgres,
  ): Promise<LmsLessonPlanRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} FROM lms_lesson_plan WHERE subject_offering_id = $1 ORDER BY created_at DESC`,
      [subjectOfferingId],
    );
    return rows.map(mapRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<LmsLessonPlanRow | null> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} FROM lms_lesson_plan WHERE id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: {
      subjectOfferingId: string;
      createdBy: string;
      title: string;
      content: string;
      weekStart: string | null;
      attachmentObjectKey: string | null;
      attachmentFileName: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO lms_lesson_plan (subject_offering_id, created_by, title, content, week_start, attachment_object_key, attachment_file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        input.subjectOfferingId,
        input.createdBy,
        input.title,
        input.content,
        input.weekStart,
        input.attachmentObjectKey,
        input.attachmentFileName,
      ],
    );
    return rows[0].id;
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      content: string;
      weekStart: string | null;
    }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) push('title', input.title);
    if (input.content !== undefined) push('content', input.content);
    if (input.weekStart !== undefined) push('week_start', input.weekStart);
    if (sets.length === 0) return;
    params.push(id);
    await executor.query(
      `UPDATE lms_lesson_plan SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params,
    );
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM lms_lesson_plan WHERE id = $1`, [id]);
  }
}
