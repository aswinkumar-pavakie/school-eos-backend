// permission_activity does NOT exist in the database yet -- this repository is the
// concrete, reviewable proposal for the eventual migration (see the module README's
// "Database design" section for the exact DDL), written exactly as it will run once
// the tables exist. It is never executed against a live database in this phase;
// MessagingService-style tests exercise the service layer against a mocked version
// of this interface instead (see permission-activity.repository.spec pattern used
// throughout this codebase's other modules).
//
// activity_date/response_deadline are `date` columns -- PostgresService's global
// type parser (added for online_class.scheduled_date) returns these as raw
// 'YYYY-MM-DD' strings, never a JS Date, so that convention is followed here too.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type PermissionActivityStatus = 'ACTIVE' | 'CANCELLED';
export type PermissionType =
  | 'ONE_TIME_ACTIVITY'
  | 'ANNUAL_CONSENT'
  | 'TERM_CONSENT'
  | 'MEDIA_CONSENT'
  | 'TRIP'
  | 'SPORTS'
  | 'OTHER';

export interface PermissionActivityView {
  id: string;
  academicYearId: string;
  academicYearName: string;
  sectionId: string;
  sectionName: string;
  gradeName: string;
  createdByStaffId: string;
  title: string;
  description: string | null;
  permissionType: PermissionType;
  activityDate: string;
  startTime: string;
  endTime: string;
  responseDeadline: string;
  status: PermissionActivityStatus;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePermissionActivityInput {
  academicYearId: string;
  sectionId: string;
  createdByStaffId: string;
  title: string;
  description: string | null;
  permissionType: PermissionType;
  activityDate: string;
  startTime: string;
  endTime: string;
  responseDeadline: string;
}

export interface UpdatePermissionActivityInput {
  title?: string;
  description?: string | null;
  activityDate?: string;
  startTime?: string;
  endTime?: string;
  responseDeadline?: string;
}

const DETAIL_SELECT = `
  SELECT a.id, a.academic_year_id, ay.name AS academic_year_name,
         a.section_id, sec.name AS section_name, g.name AS grade_name,
         a.created_by_staff_id, a.title, a.description, a.permission_type,
         a.activity_date, a.start_time, a.end_time, a.response_deadline,
         a.status, a.cancelled_at, a.cancelled_by, a.created_at, a.updated_at
  FROM permission_activity a
  JOIN academic_year ay ON ay.id = a.academic_year_id
  JOIN section sec ON sec.id = a.section_id
  JOIN grade g ON g.id = sec.grade_id
`;

interface DetailRow {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  section_id: string;
  section_name: string;
  grade_name: string;
  created_by_staff_id: string;
  title: string;
  description: string | null;
  permission_type: PermissionType;
  activity_date: string;
  start_time: string;
  end_time: string;
  response_deadline: string;
  status: PermissionActivityStatus;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: DetailRow): PermissionActivityView {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name,
    sectionId: row.section_id,
    sectionName: row.section_name,
    gradeName: row.grade_name,
    createdByStaffId: row.created_by_staff_id,
    title: row.title,
    description: row.description,
    permissionType: row.permission_type,
    activityDate: row.activity_date,
    startTime: row.start_time,
    endTime: row.end_time,
    responseDeadline: row.response_deadline,
    status: row.status,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PermissionActivityRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreatePermissionActivityInput,
    executor: Queryable,
  ): Promise<PermissionActivityView> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO permission_activity
         (academic_year_id, section_id, created_by_staff_id, title, description,
          permission_type, activity_date, start_time, end_time, response_deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.academicYearId,
        input.sectionId,
        input.createdByStaffId,
        input.title,
        input.description,
        input.permissionType,
        input.activityDate,
        input.startTime,
        input.endTime,
        input.responseDeadline,
      ],
    );
    const view = await this.findById(rows[0].id, executor);
    if (!view)
      throw new Error(
        'Permission activity vanished immediately after create — should never happen.',
      );
    return view;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<PermissionActivityView | null> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT} WHERE a.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Every activity whose (section, academic_year) is in the given set — the
   * faculty-side list, always derived from CURRENT authorization, never from
   * created_by_staff_id alone (see PermissionActivityService). */
  async listBySectionYearPairs(
    pairs: { sectionId: string; academicYearId: string }[],
    executor: Queryable = this.postgres,
  ): Promise<PermissionActivityView[]> {
    if (pairs.length === 0) return [];
    const sectionIds = pairs.map((p) => p.sectionId);
    const yearIds = pairs.map((p) => p.academicYearId);
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       JOIN unnest($1::uuid[], $2::uuid[]) AS authorized(section_id, academic_year_id)
         ON authorized.section_id = a.section_id AND authorized.academic_year_id = a.academic_year_id
       ORDER BY a.created_at DESC`,
      [sectionIds, yearIds],
    );
    return rows.map(mapRow);
  }

  /** Only fields Faculty may safely change post-creation — never academic_year_id,
   * section_id, permission_type, or created_by_staff_id (see module README). */
  async update(
    id: string,
    input: UpdatePermissionActivityInput,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE permission_activity SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         activity_date = COALESCE($4, activity_date),
         start_time = COALESCE($5, start_time),
         end_time = COALESCE($6, end_time),
         response_deadline = COALESCE($7, response_deadline),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.activityDate ?? null,
        input.startTime ?? null,
        input.endTime ?? null,
        input.responseDeadline ?? null,
      ],
    );
  }

  /** Atomic conditional update -- only succeeds from ACTIVE, mirroring the
   * claim-style state-transition pattern used throughout this codebase
   * (online_class.markLive/markCompleted). Returns false if it was already
   * CANCELLED (concurrent cancel, or a stale client retry). */
  async cancel(
    id: string,
    cancelledBy: string,
    executor: Queryable,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `UPDATE permission_activity
       SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING id`,
      [id, cancelledBy],
    );
    return rows.length > 0;
  }
}
