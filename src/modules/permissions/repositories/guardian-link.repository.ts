// Narrow, read-only view of guardian_link + student_enrolment — resolves a parent's
// CURRENT active wards and, separately, re-verifies a specific parent/student pair
// live. Kept private to permissions (mirrors the identical copy in messaging and
// online-classes — see those modules' own repository files for why: the people
// module doesn't export this shape, and duplicating a narrow, stable read-only
// query is the established precedent in this codebase over cross-module coupling).

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
   * current ACTIVE class placement. Drives the parent request list — one row per
   * ward, never merged. */
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
   * to one specific permission request. Never trust a stored request row alone. */
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
}
