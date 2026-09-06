// permission_request does NOT exist in the database yet -- same status as
// permission-activity.repository.ts (see its header comment). Written exactly as
// it will run once the tables exist; never executed against a live database in
// this phase.
//
// This table has NO parent_person_id column -- a parent's access is never stored
// here, only re-derived live through guardian_link + student_enrolment on every
// request (see PermissionRequestService). responded_by_person_id records WHO
// actually answered (for audit/display), not who is allowed to.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import type {
  PermissionActivityStatus,
  PermissionType,
} from './permission-activity.repository';

export type PermissionRequestStatus =
  'PENDING' | 'CONSENTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
export type PermissionDecision = 'CONSENTED' | 'DECLINED';

export interface PermissionRequestView {
  id: string;
  activityId: string;
  studentId: string;
  status: PermissionRequestStatus;
  respondedByPersonId: string | null;
  signedAt: Date | null;
  declineReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Joined shape for both Faculty's per-student rows and Parent's list/detail —
 * carries enough of the parent activity + student identity to render either
 * screen without a second round-trip. */
export interface PermissionRequestDetailView extends PermissionRequestView {
  studentFirstName: string;
  studentLastName: string;
  activityTitle: string;
  activityDescription: string | null;
  permissionType: PermissionType;
  activityDate: string;
  startTime: string;
  endTime: string;
  responseDeadline: string;
  activityStatus: PermissionActivityStatus;
  gradeName: string;
  sectionName: string;
  academicYearId: string;
  sectionId: string;
}

export interface StatusSummary {
  total: number;
  consented: number;
  declined: number;
  pending: number;
  expired: number;
  cancelled: number;
}

function mapRequest(row: {
  id: string;
  activity_id: string;
  student_id: string;
  status: PermissionRequestStatus;
  responded_by_person_id: string | null;
  signed_at: Date | null;
  decline_reason: string | null;
  created_at: Date;
  updated_at: Date;
}): PermissionRequestView {
  return {
    id: row.id,
    activityId: row.activity_id,
    studentId: row.student_id,
    status: row.status,
    respondedByPersonId: row.responded_by_person_id,
    signedAt: row.signed_at,
    declineReason: row.decline_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DETAIL_SELECT = `
  SELECT pr.id, pr.activity_id, pr.student_id, pr.status, pr.responded_by_person_id,
         pr.signed_at, pr.decline_reason, pr.created_at, pr.updated_at,
         p.first_name AS student_first_name, p.last_name AS student_last_name,
         pa.title AS activity_title, pa.description AS activity_description,
         pa.permission_type, pa.activity_date, pa.start_time, pa.end_time,
         pa.response_deadline, pa.status AS activity_status,
         pa.academic_year_id, pa.section_id,
         g.name AS grade_name, sec.name AS section_name
  FROM permission_request pr
  JOIN permission_activity pa ON pa.id = pr.activity_id
  JOIN student st ON st.id = pr.student_id
  JOIN person p ON p.id = st.person_id
  JOIN section sec ON sec.id = pa.section_id
  JOIN grade g ON g.id = sec.grade_id
`;

interface DetailRow {
  id: string;
  activity_id: string;
  student_id: string;
  status: PermissionRequestStatus;
  responded_by_person_id: string | null;
  signed_at: Date | null;
  decline_reason: string | null;
  created_at: Date;
  updated_at: Date;
  student_first_name: string;
  student_last_name: string;
  activity_title: string;
  activity_description: string | null;
  permission_type: PermissionType;
  activity_date: string;
  start_time: string;
  end_time: string;
  response_deadline: string;
  activity_status: PermissionActivityStatus;
  academic_year_id: string;
  section_id: string;
  grade_name: string;
  section_name: string;
}

function mapDetail(row: DetailRow): PermissionRequestDetailView {
  return {
    ...mapRequest(row),
    studentFirstName: row.student_first_name,
    studentLastName: row.student_last_name,
    activityTitle: row.activity_title,
    activityDescription: row.activity_description,
    permissionType: row.permission_type,
    activityDate: row.activity_date,
    startTime: row.start_time,
    endTime: row.end_time,
    responseDeadline: row.response_deadline,
    activityStatus: row.activity_status,
    academicYearId: row.academic_year_id,
    sectionId: row.section_id,
    gradeName: row.grade_name,
    sectionName: row.section_name,
  };
}

@Injectable()
export class PermissionRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** One row per student, in one transaction alongside the activity insert (see
   * PermissionActivityService.create) -- multi-row VALUES, not a loop of single
   * inserts, so it's one round trip regardless of class size. */
  async createMany(
    activityId: string,
    studentIds: string[],
    executor: Queryable,
  ): Promise<PermissionRequestView[]> {
    if (studentIds.length === 0) return [];
    const values = studentIds.map((_, i) => `($1, $${i + 2})`).join(', ');
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO permission_request (activity_id, student_id) VALUES ${values} RETURNING id`,
      [activityId, ...studentIds],
    );
    const ids = rows.map((r) => r.id);
    const { rows: full } = await executor.query(
      `SELECT id, activity_id, student_id, status, responded_by_person_id, signed_at, decline_reason, created_at, updated_at
       FROM permission_request WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return full.map(mapRequest);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<PermissionRequestDetailView | null> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT} WHERE pr.id = $1`,
      [id],
    );
    return rows.length ? mapDetail(rows[0]) : null;
  }

  async findByActivityId(
    activityId: string,
    executor: Queryable = this.postgres,
  ): Promise<PermissionRequestDetailView[]> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT} WHERE pr.activity_id = $1 ORDER BY p.first_name, p.last_name`,
      [activityId],
    );
    return rows.map(mapDetail);
  }

  /** Every request belonging to a student this parent is CURRENTLY an ACTIVE
   * guardian of, scoped to that student's CURRENT ACTIVE enrolment matching the
   * activity's own (section, academic_year) -- a request tied to a section/year
   * the ward is no longer actively enrolled in (transferred, promoted, closed)
   * is correctly excluded, never shown as if it were current. */
  async listForParent(
    parentPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<PermissionRequestDetailView[]> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       JOIN guardian_link gl ON gl.student_id = pr.student_id AND gl.status = 'ACTIVE'
       JOIN student_enrolment se ON se.student_id = pr.student_id AND se.status = 'ACTIVE'
         AND se.section_id = pa.section_id AND se.academic_year_id = pa.academic_year_id
       WHERE gl.person_id = $1
       ORDER BY pr.created_at DESC`,
      [parentPersonId],
    );
    return rows.map(mapDetail);
  }

  /** The same authorized-parent join as listForParent, narrowed to one request —
   * the single query that both fetches AND authorizes (never find-then-check). */
  async findForParent(
    requestId: string,
    parentPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<PermissionRequestDetailView | null> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       JOIN guardian_link gl ON gl.student_id = pr.student_id AND gl.status = 'ACTIVE'
       JOIN student_enrolment se ON se.student_id = pr.student_id AND se.status = 'ACTIVE'
         AND se.section_id = pa.section_id AND se.academic_year_id = pa.academic_year_id
       WHERE pr.id = $1 AND gl.person_id = $2`,
      [requestId, parentPersonId],
    );
    return rows.length ? mapDetail(rows[0]) : null;
  }

  /** Atomic conditional update -- only succeeds from PENDING, exactly the same
   * claim-style pattern as PermissionActivityRepository.cancel and
   * online_class.markLive/markCompleted. Returns null if the request was already
   * resolved/cancelled by the time this runs (concurrent response, or a stale
   * retry) -- the caller re-fetches to distinguish "idempotent repeat" from
   * "conflicting decision" (see PermissionRequestService). */
  async claimDecision(
    requestId: string,
    decision: PermissionDecision,
    respondedByPersonId: string,
    declineReason: string | null,
    executor: Queryable,
  ): Promise<PermissionRequestView | null> {
    const { rows } = await executor.query(
      `UPDATE permission_request
       SET status = $2, responded_by_person_id = $3, signed_at = now(), decline_reason = $4, updated_at = now()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING id, activity_id, student_id, status, responded_by_person_id, signed_at, decline_reason, created_at, updated_at`,
      [
        requestId,
        decision,
        respondedByPersonId,
        decision === 'DECLINED' ? declineReason : null,
      ],
    );
    return rows.length ? mapRequest(rows[0]) : null;
  }

  /** Cancellation cascade: every still-PENDING request under this activity moves to
   * CANCELLED in the same transaction as the activity itself -- CONSENTED/DECLINED
   * rows are untouched (historical decisions, never erased). */
  async cancelPendingByActivityId(
    activityId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE permission_request SET status = 'CANCELLED', updated_at = now()
       WHERE activity_id = $1 AND status = 'PENDING'`,
      [activityId],
    );
  }

  async summarizeByActivityId(
    activityId: string,
    executor: Queryable = this.postgres,
  ): Promise<StatusSummary> {
    const { rows } = await executor.query<{
      status: PermissionRequestStatus;
      count: string;
    }>(
      `SELECT status, count(*) FROM permission_request WHERE activity_id = $1 GROUP BY status`,
      [activityId],
    );
    const summary: StatusSummary = {
      total: 0,
      consented: 0,
      declined: 0,
      pending: 0,
      expired: 0,
      cancelled: 0,
    };
    for (const row of rows) {
      const count = Number(row.count);
      summary.total += count;
      if (row.status === 'CONSENTED') summary.consented = count;
      else if (row.status === 'DECLINED') summary.declined = count;
      else if (row.status === 'PENDING') summary.pending = count;
      else if (row.status === 'EXPIRED') summary.expired = count;
      else if (row.status === 'CANCELLED') summary.cancelled = count;
    }
    return summary;
  }
}
