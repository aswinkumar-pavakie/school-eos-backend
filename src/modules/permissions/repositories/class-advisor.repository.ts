// Class-advisor source of truth: role_assignment with role_code='CLASS_ADVISOR',
// scope_type='SECTION', scope_id=<section.id>, status='ACTIVE'. Verified against
// real, populated data in this project (see the messaging module's identical
// repository, built and confirmed earlier in this codebase's history).
//
// role_assignment.academic_year_id is unreliable on real CLASS_ADVISOR rows (mostly
// NULL) — every query here joins through section.academic_year_id instead, since
// each academic year has its own distinct section rows (scope_id already encodes
// the year unambiguously).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import type { SectionYearContext } from './subject-offering.repository';

@Injectable()
export class ClassAdvisorRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every (section, academic_year) this person currently holds an ACTIVE
   * CLASS_ADVISOR assignment for. */
  async findActiveSectionsForAdvisor(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<SectionYearContext[]> {
    const { rows } = await executor.query<{
      section_id: string;
      academic_year_id: string;
    }>(
      `SELECT DISTINCT sec.id AS section_id, sec.academic_year_id
       FROM role_assignment ra
       JOIN section sec ON sec.id = ra.scope_id
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.person_id = $1 AND ra.status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((row) => ({
      sectionId: row.section_id,
      academicYearId: row.academic_year_id,
    }));
  }
}
