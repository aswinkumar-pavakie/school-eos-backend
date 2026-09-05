// Read-only lookup over student_fee_assignment — used both to validate bulk-import
// rows reference a real assignment, and to populate a real dropdown for it (so
// Finance never has to type a raw assignment/student UUID from memory).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';

export interface StudentFeeAssignmentRow {
  id: string;
  studentId: string;
  studentDisplayName: string | null;
  studentAdmissionNo: string | null;
  netPaise: string;
}

@Injectable()
export class StudentFeeAssignmentLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async exists(assignmentId: string, studentId: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM student_fee_assignment WHERE id = $1 AND student_id = $2 LIMIT 1`,
      [assignmentId, studentId],
    );
    return rows.length > 0;
  }

  /** One assignment IS one student — the dropdown picks the assignment, and its
   * student_id travels with it, so the form never asks for a separate student pick. */
  async list(executor: Queryable = this.postgres): Promise<StudentFeeAssignmentRow[]> {
    const { rows } = await executor.query(
      `SELECT sfa.id, sfa.student_id, sfa.net_paise, p.display_name AS student_display_name, s.admission_no AS student_admission_no
       FROM student_fee_assignment sfa
       LEFT JOIN student s ON s.id = sfa.student_id
       LEFT JOIN person p ON p.id = s.person_id
       WHERE sfa.status = 'ACTIVE'
       ORDER BY p.display_name ASC NULLS LAST
       LIMIT 2000`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      studentId: r.student_id,
      studentDisplayName: r.student_display_name,
      studentAdmissionNo: r.student_admission_no,
      netPaise: r.net_paise,
    }));
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<{ studentId: string } | null> {
    const { rows } = await executor.query(`SELECT student_id FROM student_fee_assignment WHERE id = $1`, [id]);
    return rows.length ? { studentId: rows[0].student_id } : null;
  }
}
