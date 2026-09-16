import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SectionFeeDemandRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  rollNo: number | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  feeHeadName: string | null;
  dueDate: string;
  state: string;
  pendingPaise: string;
}

// Real per-section fee status for a class advisor -- reads the exact same
// fee_demand/student_fee_assignment/fee_head tables the ADMIN-only
// FeeDemandRepository already reads (finance/repositories/fee-demand.
// repository.ts), section-scoped via a real student_enrolment join (never a
// bare query param -- the service also independently checks
// isAdvisorForSection before calling this). Adds roll_no and the primary
// guardian's name (guardian_link.is_primary_contact), neither of which the
// ADMIN-facing repository selects, since this screen's design needs both.
@Injectable()
export class FacultyFeesRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findDemandsForSection(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<SectionFeeDemandRow[]> {
    const { rows } = await executor.query<SectionFeeDemandRow>(
      `SELECT fd.id, fd.student_id AS "studentId",
              p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
              se.roll_no AS "rollNo",
              pp.first_name AS "parentFirstName", pp.last_name AS "parentLastName",
              fh.name AS "feeHeadName", fd.due_date AS "dueDate", fd.state,
              (fd.amount_paise + fd.late_fee_paise - fd.paid_paise) AS "pendingPaise"
       FROM fee_demand fd
       JOIN student_fee_assignment sfa ON sfa.id = fd.assignment_id
         AND sfa.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       JOIN student s ON s.id = fd.student_id
       JOIN person p ON p.id = s.person_id
       JOIN student_enrolment se ON se.student_id = fd.student_id
         AND se.section_id = $1 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN fee_head fh ON fh.id = fd.fee_head_id
       LEFT JOIN guardian_link gl ON gl.student_id = fd.student_id
         AND gl.is_primary_contact = true AND gl.status = 'ACTIVE'
       LEFT JOIN person pp ON pp.id = gl.person_id
       WHERE fd.state != 'CANCELLED'
       ORDER BY fd.due_date`,
      [sectionId],
    );
    return rows;
  }
}
