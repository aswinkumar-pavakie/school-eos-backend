// Narrow, read-only view of guardian_link + student_enrolment — resolves a parent's
// CURRENT active wards and, separately, re-verifies a specific parent/student pair
// live. Kept private to messaging (mirrors online-classes' own private copy) rather
// than the still-stub people module. Every method requires guardian_link.status =
// 'ACTIVE' and student_enrolment.status = 'ACTIVE' — a REVOKED guardian or a
// TRANSFERRED_SECTION/CLOSED enrolment never satisfies either.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ActiveWardEnrolment {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  academicYearId: string;
  academicYearName: string;
  sectionId: string;
  sectionName: string;
  gradeName: string;
}

export interface StudentGuardianPair {
  studentId: string;
  academicYearId: string;
  sectionId: string;
  parentPersonId: string;
}

export interface StudentActiveGuardian {
  personId: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
}

export interface StudentActiveContext {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  academicYearId: string;
  sectionId: string;
  guardians: StudentActiveGuardian[];
}

const WARD_ENROLMENT_SELECT = `
  SELECT st.id AS student_id, p.first_name AS student_first_name, p.last_name AS student_last_name,
         ay.id AS academic_year_id, ay.name AS academic_year_name,
         sec.id AS section_id, sec.name AS section_name, g.name AS grade_name
  FROM guardian_link gl
  JOIN student st ON st.id = gl.student_id
  JOIN person p ON p.id = st.person_id
  JOIN student_enrolment se ON se.student_id = st.id AND se.status = 'ACTIVE'
  JOIN academic_year ay ON ay.id = se.academic_year_id
  JOIN section sec ON sec.id = se.section_id
  JOIN grade g ON g.id = sec.grade_id
  WHERE gl.status = 'ACTIVE'
`;

@Injectable()
export class GuardianLinkRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every ward this parent is currently an ACTIVE guardian of, with each ward's
   * current ACTIVE class placement. Drives the parent conversation list — one row
   * per ward, never merged. */
  async findActiveWardEnrolments(
    parentPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<ActiveWardEnrolment[]> {
    const { rows } = await executor.query<{
      student_id: string;
      student_first_name: string;
      student_last_name: string;
      academic_year_id: string;
      academic_year_name: string;
      section_id: string;
      section_name: string;
      grade_name: string;
    }>(`${WARD_ENROLMENT_SELECT} AND gl.person_id = $1`, [parentPersonId]);
    return rows.map((row) => ({
      studentId: row.student_id,
      studentFirstName: row.student_first_name,
      studentLastName: row.student_last_name,
      academicYearId: row.academic_year_id,
      academicYearName: row.academic_year_name,
      sectionId: row.section_id,
      sectionName: row.section_name,
      gradeName: row.grade_name,
    }));
  }

  /** Re-verifies, live, that this parent is currently an ACTIVE guardian of this
   * exact student AND that student's current ACTIVE enrolment matches the given
   * academic year + section — the single JOIN that authorizes (or denies) access
   * to one specific conversation. Never trust a stored conversation row alone. */
  async findActiveWardEnrolment(
    parentPersonId: string,
    studentId: string,
    academicYearId: string,
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<ActiveWardEnrolment | null> {
    const { rows } = await executor.query<{
      student_id: string;
      student_first_name: string;
      student_last_name: string;
      academic_year_id: string;
      academic_year_name: string;
      section_id: string;
      section_name: string;
      grade_name: string;
    }>(
      `${WARD_ENROLMENT_SELECT}
         AND gl.person_id = $1 AND gl.student_id = $2
         AND se.academic_year_id = $3 AND se.section_id = $4`,
      [parentPersonId, studentId, academicYearId, sectionId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      studentId: row.student_id,
      studentFirstName: row.student_first_name,
      studentLastName: row.student_last_name,
      academicYearId: row.academic_year_id,
      academicYearName: row.academic_year_name,
      sectionId: row.section_id,
      sectionName: row.section_name,
      gradeName: row.grade_name,
    };
  }

  /** Every ACTIVE (student, guardian) pair across a faculty's currently-authorized
   * (section, academic_year) set, in one round trip -- feeds the Faculty-side
   * conversation auto-creation in MessagingService.listConversations, so every
   * student they teach or advise is searchable/messageable even before any parent
   * has ever opened the app. */
  async findActiveGuardiansForSections(
    pairs: { sectionId: string; academicYearId: string }[],
    executor: Queryable = this.postgres,
  ): Promise<StudentGuardianPair[]> {
    if (pairs.length === 0) return [];
    const sectionIds = pairs.map((p) => p.sectionId);
    const yearIds = pairs.map((p) => p.academicYearId);
    const { rows } = await executor.query<{
      student_id: string;
      academic_year_id: string;
      section_id: string;
      parent_person_id: string;
    }>(
      `SELECT DISTINCT se.student_id, se.academic_year_id, se.section_id, gl.person_id AS parent_person_id
       FROM student_enrolment se
       JOIN unnest($1::uuid[], $2::uuid[]) AS authorized(section_id, academic_year_id)
         ON authorized.section_id = se.section_id AND authorized.academic_year_id = se.academic_year_id
       JOIN guardian_link gl ON gl.student_id = se.student_id AND gl.status = 'ACTIVE'
       WHERE se.status = 'ACTIVE'`,
      [sectionIds, yearIds],
    );
    return rows.map((row) => ({
      studentId: row.student_id,
      academicYearId: row.academic_year_id,
      sectionId: row.section_id,
      parentPersonId: row.parent_person_id,
    }));
  }

  /** For the Principal "message a student" flow -- resolves an ARBITRARY student
   * (not scoped to any parent or pre-authorized section list, unlike every other
   * method here) to their current ACTIVE enrolment plus every currently ACTIVE
   * guardian. Returns null if the student has no current ACTIVE enrolment (nothing
   * for a Principal to message about yet). A student with zero ACTIVE guardians
   * still resolves (empty `guardians` array) -- the caller decides what to do with
   * that, this method only reports live DB state. */
  async findActiveContextForStudent(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentActiveContext | null> {
    const { rows: enrolmentRows } = await executor.query<{
      student_id: string;
      student_first_name: string;
      student_last_name: string;
      academic_year_id: string;
      section_id: string;
    }>(
      `SELECT st.id AS student_id, p.first_name AS student_first_name, p.last_name AS student_last_name,
              se.academic_year_id, se.section_id
       FROM student st
       JOIN person p ON p.id = st.person_id
       JOIN student_enrolment se ON se.student_id = st.id AND se.status = 'ACTIVE'
       WHERE st.id = $1`,
      [studentId],
    );
    if (enrolmentRows.length === 0) return null;
    const enrolment = enrolmentRows[0];

    const { rows: guardianRows } = await executor.query<{
      person_id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
    }>(
      `SELECT p.id AS person_id, p.first_name, p.last_name, p.display_name
       FROM guardian_link gl
       JOIN person p ON p.id = gl.person_id
       WHERE gl.student_id = $1 AND gl.status = 'ACTIVE'`,
      [studentId],
    );

    return {
      studentId: enrolment.student_id,
      studentFirstName: enrolment.student_first_name,
      studentLastName: enrolment.student_last_name,
      academicYearId: enrolment.academic_year_id,
      sectionId: enrolment.section_id,
      guardians: guardianRows.map((row) => ({
        personId: row.person_id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
      })),
    };
  }
}
