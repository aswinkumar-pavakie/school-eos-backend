// Narrow, read-only view of subject_offering — one half of "is this faculty
// authorized for this section" (the other half is ClassAdvisorRepository). Kept
// private to permissions (each module in this codebase keeps its own narrow copy —
// see guardian-link.repository.ts's header comment).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SectionYearContext {
  sectionId: string;
  academicYearId: string;
}

@Injectable()
export class SubjectOfferingRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every (section, academic_year) this faculty currently, actively teaches at
   * least one ACTIVE subject offering in. */
  async findActiveSectionsForTeacher(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<SectionYearContext[]> {
    const { rows } = await executor.query<{
      section_id: string;
      academic_year_id: string;
    }>(
      `SELECT DISTINCT section_id, academic_year_id
       FROM subject_offering
       WHERE teacher_staff_id = $1 AND status = 'ACTIVE'`,
      [staffId],
    );
    return rows.map((row) => ({
      sectionId: row.section_id,
      academicYearId: row.academic_year_id,
    }));
  }
}
