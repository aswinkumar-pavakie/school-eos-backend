// student_leave_request already exists in the schema with its own
// CLASS_ADVISOR-routed approval_policy row (STUDENT_LEAVE_REQUEST) -- this
// repository is the Faculty-facing read model + the decision-side writes the
// subject-state handler needs. Creating a request is a Parent-side concern
// (explicitly out of scope here); this only ever reads and decides.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentLeaveRequestRow {
  id: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  rollNo: number | null;
  gradeName: string | null;
  sectionName: string | null;
  fromDate: string;
  toDate: string;
  reason: string;
  skipSchoolTransport: boolean;
  attachmentFileName: string | null;
  attachmentObjectKey: string | null;
  state: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  approvalRequestId: string | null;
}

const COLUMNS = `
  slr.id, slr.student_id, slr.from_date, slr.to_date, slr.reason, slr.skip_school_transport,
  slr.attachment_file_name, slr.attachment_object_key,
  slr.state, slr.decided_by, slr.decided_at, slr.created_at,
  p.first_name, p.last_name, s.admission_no,
  se.roll_no, g.name AS grade_name, sec.name AS section_name,
  ar.id AS approval_request_id`;

const FROM = `
  FROM student_leave_request slr
  JOIN student s ON s.id = slr.student_id
  JOIN person p ON p.id = s.person_id
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id
  LEFT JOIN approval_request ar ON ar.subject_object_type = 'student_leave_request' AND ar.subject_object_id = slr.id::text`;

function mapRow(row: any): StudentLeaveRequestRow {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    admissionNo: row.admission_no,
    rollNo: row.roll_no,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    fromDate: row.from_date,
    toDate: row.to_date,
    reason: row.reason,
    skipSchoolTransport: row.skip_school_transport,
    attachmentFileName: row.attachment_file_name,
    attachmentObjectKey: row.attachment_object_key,
    state: row.state,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    approvalRequestId: row.approval_request_id,
  };
}

@Injectable()
export class StudentLeaveRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every leave request for a student currently enrolled in one of these
   * sections -- the Faculty class-advisor's own inbox. */
  async findBySections(
    sectionIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<StudentLeaveRequestRow[]> {
    if (sectionIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE se.section_id = ANY($1::uuid[]) ORDER BY slr.created_at DESC`,
      [sectionIds],
    );
    return rows.map(mapRow);
  }

  /** Every leave request this one real student has ever raised -- the
   * Parent-app's own "History" tab. */
  async findByStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentLeaveRequestRow[]> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE slr.student_id = $1 ORDER BY slr.created_at DESC`,
      [studentId],
    );
    return rows.map(mapRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentLeaveRequestRow | null> {
    const { rows } = await executor.query(
      `SELECT ${COLUMNS} ${FROM} WHERE slr.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** The student's own current section -- resolved fresh at decision time (not
   * trusted from whatever section they were in when the request was raised),
   * since that's the real section attendance must be marked against. */
  async findCurrentSectionForStudent(
    studentId: string,
    executor: Queryable,
  ): Promise<{ sectionId: string } | null> {
    const { rows } = await executor.query(
      `SELECT section_id FROM student_enrolment
       WHERE student_id = $1 AND status = 'ACTIVE'
         AND academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)`,
      [studentId],
    );
    return rows.length ? { sectionId: rows[0].section_id } : null;
  }

  /** The real guardian-link check every creation of a leave request runs first
   * -- only an ACTIVE guardian of this exact student may raise a request for
   * them (same boundary the Parent Fees/Events features already enforce). */
  async isActiveGuardian(
    personId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM guardian_link WHERE person_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
      [personId, studentId],
    );
    return rows.length > 0;
  }

  async setDecision(
    id: string,
    state: 'APPROVED' | 'REJECTED',
    decidedBy: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE student_leave_request SET state = $2, decided_by = $3, decided_at = now(), updated_at = now() WHERE id = $1`,
      [id, state, decidedBy],
    );
  }

  /** Minimal creation path -- raising the actual request is a real Parent-app
   * feature (its own composer UI, attachment upload, etc.) explicitly out of
   * scope for this build. This exists only so a genuine
   * student_leave_request + approval_request pair can exist at all for the
   * Faculty side to act on -- without it, this whole feature would have
   * nothing real to test against. */
  async create(
    input: {
      studentId: string;
      fromDate: string;
      toDate: string;
      reason: string;
      requestedBy: string;
      skipSchoolTransport?: boolean;
      attachmentObjectKey?: string | null;
      attachmentFileName?: string | null;
    },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO student_leave_request (student_id, requested_by, from_date, to_date, reason, skip_school_transport, attachment_object_key, attachment_file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        input.studentId,
        input.requestedBy,
        input.fromDate,
        input.toDate,
        input.reason,
        input.skipSchoolTransport ?? false,
        input.attachmentObjectKey ?? null,
        input.attachmentFileName ?? null,
      ],
    );
    return rows[0].id;
  }
}
