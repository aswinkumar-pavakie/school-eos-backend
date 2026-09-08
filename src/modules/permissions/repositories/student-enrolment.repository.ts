// Narrow, read-only view of student_enrolment — backs two things Faculty's create
// flow needs: resolving "all active students in this section" (when no explicit
// selection is given), and independently re-validating each explicitly-selected
// studentId against the exact (section, academic_year) the activity targets. A
// student id the client supplies is NEVER trusted without this check.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface EnrolledStudentView {
  studentId: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class StudentEnrolmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every student with an ACTIVE enrolment in this exact section+year — the
   * "all students" resolution path. Never sourced from client input. */
  async findActiveStudentsInSection(
    sectionId: string,
    academicYearId: string,
    executor: Queryable = this.postgres,
  ): Promise<EnrolledStudentView[]> {
    const { rows } = await executor.query<{
      student_id: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT st.id AS student_id, p.first_name, p.last_name
       FROM student_enrolment se
       JOIN student st ON st.id = se.student_id
       JOIN person p ON p.id = st.person_id
       WHERE se.section_id = $1 AND se.academic_year_id = $2 AND se.status = 'ACTIVE'
       ORDER BY p.first_name, p.last_name`,
      [sectionId, academicYearId],
    );
    return rows.map((row) => ({
      studentId: row.student_id,
      firstName: row.first_name,
      lastName: row.last_name,
    }));
  }

  /** Re-validates one explicitly-selected studentId against the exact section+year
   * the activity targets — an ACTIVE student_enrolment must exist for all three, or
   * this student is rejected (wrong section, wrong year, or not actively enrolled
   * at all). */
  async isActivelyEnrolled(
    studentId: string,
    sectionId: string,
    academicYearId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM student_enrolment
       WHERE student_id = $1 AND section_id = $2 AND academic_year_id = $3 AND status = 'ACTIVE'
       LIMIT 1`,
      [studentId, sectionId, academicYearId],
    );
    return rows.length > 0;
  }
}
