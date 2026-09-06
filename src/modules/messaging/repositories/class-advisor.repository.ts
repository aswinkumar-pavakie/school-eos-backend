// Class-advisor source of truth: role_assignment with role_code='CLASS_ADVISOR',
// scope_type='SECTION', scope_id=<section.id>, status='ACTIVE'. Verified against
// real, populated data before this module was built (see README "Class advisor
// source of truth") — this is NOT an invented relationship.
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
import type {
  FacultyPersonView,
  SectionYearContext,
} from './subject-offering.repository';

@Injectable()
export class ClassAdvisorRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The current ACTIVE class advisor(s) for this exact section (ordinarily one,
   * but not assumed to be exactly one — see README). Requires the advisor's own
   * staff row to also be ACTIVE. */
  async findActiveAdvisorsForSection(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<FacultyPersonView[]> {
    const { rows } = await executor.query<{
      staff_id: string;
      person_id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
    }>(
      `SELECT DISTINCT s.id AS staff_id, p.id AS person_id, p.first_name, p.last_name, p.display_name
       FROM role_assignment ra
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       JOIN person p ON p.id = ra.person_id
       WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.scope_id = $1 AND ra.status = 'ACTIVE'`,
      [sectionId],
    );
    return rows.map((row) => ({
      staffId: row.staff_id,
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
    }));
  }

  /** Bulk version of findActiveAdvisorsForSection -- every ACTIVE class advisor
   * across many sections in one query, grouped by section id. Feeds
   * MessagingService's bulk list-summary builder (see
   * SubjectOfferingRepository.findActiveTeachersForSections for why this exists). */
  async findActiveAdvisorsForSections(
    sectionIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<Map<string, FacultyPersonView[]>> {
    const result = new Map<string, FacultyPersonView[]>();
    if (sectionIds.length === 0) return result;
    const { rows } = await executor.query<{
      scope_id: string;
      staff_id: string;
      person_id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
    }>(
      `SELECT DISTINCT ra.scope_id, s.id AS staff_id, p.id AS person_id, p.first_name, p.last_name, p.display_name
       FROM role_assignment ra
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       JOIN person p ON p.id = ra.person_id
       WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.scope_id = ANY($1::uuid[]) AND ra.status = 'ACTIVE'`,
      [sectionIds],
    );
    for (const row of rows) {
      const view: FacultyPersonView = {
        staffId: row.staff_id,
        personId: row.person_id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
      };
      const existing = result.get(row.scope_id);
      if (existing) existing.push(view);
      else result.set(row.scope_id, [view]);
    }
    return result;
  }

  /** Every (section, academic_year) this person currently holds an ACTIVE
   * CLASS_ADVISOR assignment for — the advisor-side half of "which conversations
   * can this faculty currently reach", joined through section since
   * role_assignment.academic_year_id itself can't be trusted (see file header). */
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
