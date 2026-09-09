// online_class is anchored on subject_offering_id only — subject/class/section/academic
// year are never duplicated here, only joined out for display (see DETAIL_SELECT).
// Google Calendar/Meet fields (google_calendar_event_id, google_meet_id, meeting_url,
// meeting_creation_status/error) are written by Phase 6/7's integration, not here —
// this repository only ever leaves them at their PENDING/null defaults.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type OnlineClassStatus =
  'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
export type MeetingCreationStatus =
  'PENDING' | 'CREATING' | 'SUCCEEDED' | 'FAILED';
export type OnlineClassView = 'upcoming' | 'completed' | 'cancelled';

export const VIEW_STATUSES: Record<OnlineClassView, OnlineClassStatus[]> = {
  upcoming: ['DRAFT', 'SCHEDULED', 'LIVE'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
};

export interface OnlineClassDetail {
  id: string;
  subjectOfferingId: string;
  facultyStaffId: string;
  subjectName: string;
  gradeName: string;
  sectionName: string;
  topic: string;
  description: string | null;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: OnlineClassStatus;
  meetingProvider: string;
  meetingCreationStatus: MeetingCreationStatus;
  meetingCreationError: string | null;
  googleCalendarEventId: string | null;
  googleMeetId: string | null;
  meetingUrl: string | null;
  recordingUrl: string | null;
  recordingAddedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface DetailRow {
  id: string;
  subject_offering_id: string;
  faculty_staff_id: string;
  subject_name: string;
  grade_name: string;
  section_name: string;
  topic: string;
  description: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: OnlineClassStatus;
  meeting_provider: string;
  meeting_creation_status: MeetingCreationStatus;
  meeting_creation_error: string | null;
  google_calendar_event_id: string | null;
  google_meet_id: string | null;
  meeting_url: string | null;
  recording_url: string | null;
  recording_added_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

const DETAIL_SELECT = `
  SELECT oc.id, oc.subject_offering_id, oc.faculty_staff_id,
         subj.name AS subject_name, g.name AS grade_name, sec.name AS section_name,
         oc.topic, oc.description, oc.scheduled_date, oc.start_time, oc.end_time,
         oc.status, oc.meeting_provider, oc.meeting_creation_status, oc.meeting_creation_error,
         oc.google_calendar_event_id, oc.google_meet_id, oc.meeting_url,
         oc.recording_url, oc.recording_added_at,
         oc.cancelled_at, oc.cancellation_reason,
         oc.created_at, oc.updated_at, oc.version
  FROM online_class oc
  JOIN subject_offering so ON so.id = oc.subject_offering_id
  JOIN subject subj ON subj.id = so.subject_id
  JOIN section sec ON sec.id = so.section_id
  JOIN grade g ON g.id = sec.grade_id
`;

function toDetail(row: DetailRow): OnlineClassDetail {
  return {
    id: row.id,
    subjectOfferingId: row.subject_offering_id,
    facultyStaffId: row.faculty_staff_id,
    subjectName: row.subject_name,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    topic: row.topic,
    description: row.description,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    meetingProvider: row.meeting_provider,
    meetingCreationStatus: row.meeting_creation_status,
    meetingCreationError: row.meeting_creation_error,
    googleCalendarEventId: row.google_calendar_event_id,
    googleMeetId: row.google_meet_id,
    meetingUrl: row.meeting_url,
    recordingUrl: row.recording_url,
    recordingAddedAt: row.recording_added_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

// Parent-facing shape: deliberately narrower than OnlineClassDetail — no
// facultyStaffId/subjectOfferingId, no idempotency/version bookkeeping, and no Google
// internal fields (googleCalendarEventId, googleMeetId, meetingCreationStatus/Error).
// A parent gets meetingUrl when it's ready and nothing else Google-related.
export interface ParentOnlineClassView {
  id: string;
  subjectName: string;
  gradeName: string;
  sectionName: string;
  topic: string;
  description: string | null;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: OnlineClassStatus;
  meetingUrl: string | null;
  recordingUrl: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ParentDetailRow {
  id: string;
  subject_name: string;
  grade_name: string;
  section_name: string;
  topic: string;
  description: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: OnlineClassStatus;
  meeting_url: string | null;
  recording_url: string | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// The authorization relationship IS the query: online_class is only reachable through
// an ACTIVE student_enrolment (matched on both section AND the offering's own
// academic_year_id — never a separate "current year" lookup) belonging to a student
// with an ACTIVE guardian_link to the caller. DISTINCT collapses the fan-out when two
// wards share a section (or, in principle, when a parent has two active links to the
// same student) — every selected column is per-online_class/per-offering, never
// per-ward, so identical rows collapse to exactly one.
const PARENT_SELECT = `
  SELECT DISTINCT oc.id,
         subj.name AS subject_name, g.name AS grade_name, sec.name AS section_name,
         oc.topic, oc.description, oc.scheduled_date, oc.start_time, oc.end_time,
         oc.status, oc.meeting_url, oc.recording_url, oc.cancellation_reason,
         oc.created_at, oc.updated_at
  FROM online_class oc
  JOIN subject_offering so ON so.id = oc.subject_offering_id
  JOIN subject subj ON subj.id = so.subject_id
  JOIN section sec ON sec.id = so.section_id
  JOIN grade g ON g.id = sec.grade_id
  JOIN student_enrolment se
    ON se.section_id = so.section_id
   AND se.academic_year_id = so.academic_year_id
   AND se.status = 'ACTIVE'
  JOIN guardian_link gl
    ON gl.student_id = se.student_id
   AND gl.status = 'ACTIVE'
`;

function toParentView(row: ParentDetailRow): ParentOnlineClassView {
  return {
    id: row.id,
    subjectName: row.subject_name,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    topic: row.topic,
    description: row.description,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    meetingUrl: row.meeting_url,
    recordingUrl: row.recording_url,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateOnlineClassParams {
  subjectOfferingId: string;
  facultyStaffId: string;
  topic: string;
  description: string | null;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  idempotencyKey: string;
  createdBy: string;
}

@Injectable()
export class OnlineClassRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    params: CreateOnlineClassParams,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO online_class
         (subject_offering_id, faculty_staff_id, topic, description,
          scheduled_date, start_time, end_time, idempotency_key, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id`,
      [
        params.subjectOfferingId,
        params.facultyStaffId,
        params.topic,
        params.description,
        params.scheduledDate,
        params.startTime,
        params.endTime,
        params.idempotencyKey,
        params.createdBy,
      ],
    );
    return rows[0].id;
  }

  /** Faculty-scoped idempotency lookup — same key from the same faculty returns the
   * original record instead of creating a duplicate (mirrors card_tap_event/
   * staff_attendance_event's device-scoped pattern; see 0002_online_classes.sql). */
  async findByFacultyAndIdempotencyKey(
    facultyStaffId: string,
    idempotencyKey: string,
    executor: Queryable = this.postgres,
  ): Promise<{ id: string } | null> {
    const { rows } = await executor.query<{ id: string }>(
      `SELECT id FROM online_class WHERE faculty_staff_id = $1 AND idempotency_key = $2`,
      [facultyStaffId, idempotencyKey],
    );
    return rows.length === 0 ? null : { id: rows[0].id };
  }

  async findDetailById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<OnlineClassDetail | null> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT} WHERE oc.id = $1`,
      [id],
    );
    return rows.length === 0 ? null : toDetail(rows[0]);
  }

  async listByFacultyAndStatuses(
    facultyStaffId: string,
    statuses: OnlineClassStatus[],
    executor: Queryable = this.postgres,
  ): Promise<OnlineClassDetail[]> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       WHERE oc.faculty_staff_id = $1 AND oc.status = ANY($2::text[])
       ORDER BY oc.scheduled_date, oc.start_time`,
      [facultyStaffId, statuses],
    );
    return rows.map(toDetail);
  }

  /** True if this faculty already has a non-cancelled online class overlapping the given
   * time range on the given date. excludeId lets reschedule check against every other
   * class while excluding itself. */
  async hasOverlap(
    facultyStaffId: string,
    scheduledDate: string,
    startTime: string,
    endTime: string,
    excludeId: string | null,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query<{ overlap_exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM online_class
         WHERE faculty_staff_id = $1
           AND scheduled_date = $2
           AND status IN ('DRAFT', 'SCHEDULED', 'LIVE')
           AND start_time < $4 AND end_time > $3
           AND ($5::uuid IS NULL OR id <> $5)
       ) AS overlap_exists`,
      [facultyStaffId, scheduledDate, startTime, endTime, excludeId],
    );
    return rows[0].overlap_exists;
  }

  async updateSchedule(
    id: string,
    params: {
      scheduledDate: string;
      startTime: string;
      endTime: string;
      updatedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE online_class
       SET scheduled_date = $2, start_time = $3, end_time = $4,
           updated_by = $5, updated_at = now(), version = version + 1
       WHERE id = $1`,
      [
        id,
        params.scheduledDate,
        params.startTime,
        params.endTime,
        params.updatedBy,
      ],
    );
  }

  async cancel(
    id: string,
    params: { cancelledBy: string; reason: string | null },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE online_class
       SET status = 'CANCELLED', cancelled_by = $2, cancelled_at = now(),
           cancellation_reason = $3, updated_by = $2, updated_at = now(), version = version + 1
       WHERE id = $1`,
      [id, params.cancelledBy, params.reason],
    );
  }

  async addRecording(
    id: string,
    params: { recordingUrl: string; addedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE online_class
       SET recording_url = $2, recording_added_by = $3, recording_added_at = now(),
           updated_by = $3, updated_at = now(), version = version + 1
       WHERE id = $1`,
      [id, params.recordingUrl, params.addedBy],
    );
  }

  /** Atomically claims the row for a Calendar/Meet creation attempt: from PENDING or
   * FAILED unconditionally, or from CREATING only if it's been stuck there for over 30
   * seconds (a genuinely-async "pending" conference from Google, or a crashed attempt
   * that never got to record an outcome — either way, long enough that no real
   * concurrent attempt is still in flight). Never reclaims a fresh CREATING row, which
   * is what actually prevents two concurrent schedule() calls from both calling Google.
   * Returns false if the claim didn't apply — the caller must not call Google in that
   * case. This UPDATE is the real duplicate-prevention mechanism, not Google's own
   * requestId (which only protects re-attaching a conference to an *existing* event,
   * not a fresh events.insert). */
  async claimForMeetingCreation(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `UPDATE online_class
       SET meeting_creation_status = 'CREATING', updated_at = now()
       WHERE id = $1
         AND (
           meeting_creation_status IN ('PENDING', 'FAILED')
           OR (meeting_creation_status = 'CREATING' AND updated_at < now() - interval '30 seconds')
         )`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async markMeetingSucceeded(
    id: string,
    params: {
      googleCalendarEventId: string;
      googleMeetId: string;
      meetingUrl: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE online_class
       SET status = 'SCHEDULED', meeting_creation_status = 'SUCCEEDED', meeting_creation_error = NULL,
           google_calendar_event_id = $2, google_meet_id = $3, meeting_url = $4,
           updated_at = now()
       WHERE id = $1`,
      [
        id,
        params.googleCalendarEventId,
        params.googleMeetId,
        params.meetingUrl,
      ],
    );
  }

  /** Conference create request is still "pending" on Google's side after our bounded
   * poll — not a failure. Persists the real event id (so a retry re-checks this same
   * event via events.get instead of calling events.insert again) but leaves
   * meeting_creation_status at CREATING (set by claimForMeetingCreation) and status at
   * DRAFT — neither SUCCEEDED nor FAILED would be true yet. */
  async markMeetingStillPending(
    id: string,
    params: { googleCalendarEventId: string },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE online_class
       SET google_calendar_event_id = $2, updated_at = now()
       WHERE id = $1`,
      [id, params.googleCalendarEventId],
    );
  }

  async markMeetingFailed(
    id: string,
    params: { errorMessage: string },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE online_class
       SET meeting_creation_status = 'FAILED', meeting_creation_error = $2, updated_at = now()
       WHERE id = $1`,
      [id, params.errorMessage],
    );
  }

  /** SCHEDULED -> LIVE, atomically. The WHERE clause is the actual enforcement of the
   * state machine (mirrors claimForMeetingCreation's claim pattern) — race-safe, and
   * the only way this transition can ever apply. Returns false if the row wasn't
   * SCHEDULED, so the caller can report the correct current state rather than a
   * generic error. */
  async markLive(
    id: string,
    params: { updatedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `UPDATE online_class
       SET status = 'LIVE', updated_by = $2, updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'SCHEDULED'`,
      [id, params.updatedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  /** LIVE -> COMPLETED, atomically — same pattern as markLive. */
  async markCompleted(
    id: string,
    params: { updatedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `UPDATE online_class
       SET status = 'COMPLETED', updated_by = $2, updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'LIVE'`,
      [id, params.updatedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Parent-scoped list — deliberately NOT a filtered call to
   * listByFacultyAndStatuses; that method is faculty-owner-scoped and structurally
   * cannot express "any of my wards' sections". This is its own self-contained query
   * whose FROM/JOIN clauses ARE the authorization check (see PARENT_SELECT) — not a
   * separate access check bolted onto a plain lookup. */
  async listForParent(
    parentPersonId: string,
    statuses: OnlineClassStatus[],
    executor: Queryable = this.postgres,
  ): Promise<ParentOnlineClassView[]> {
    const { rows } = await executor.query<ParentDetailRow>(
      `${PARENT_SELECT}
       WHERE gl.person_id = $1 AND oc.status = ANY($2::text[])
       ORDER BY oc.scheduled_date, oc.start_time`,
      [parentPersonId, statuses],
    );
    return rows.map(toParentView);
  }

  /** Parent-scoped detail — a single query that both finds the class AND proves the
   * caller is authorized for it in one step (never "find by id, then check
   * separately"). Returns null for "doesn't exist" and "exists but not authorized"
   * alike — the caller must treat both identically (404, never 403). */
  async findParentDetailById(
    id: string,
    parentPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<ParentOnlineClassView | null> {
    const { rows } = await executor.query<ParentDetailRow>(
      `${PARENT_SELECT}
       WHERE oc.id = $1 AND gl.person_id = $2`,
      [id, parentPersonId],
    );
    return rows.length === 0 ? null : toParentView(rows[0]);
  }
}
