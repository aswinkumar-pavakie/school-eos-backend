// Narrow, read-only view of subject_offering — one half of "who is authorized
// faculty for this ward's class" (the other half is ClassAdvisorRepository). Kept
// private to messaging; online-classes has its own separate private copy for its
// own purpose (validating scheduling authority), not shared here to avoid coupling
// two unrelated modules on one internal repository.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FacultyPersonView {
  staffId: string;
  personId: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
}

export interface SectionYearContext {
  sectionId: string;
  academicYearId: string;
}

@Injectable()
export class SubjectOfferingRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every ACTIVE subject teacher (ACTIVE staff row too) currently teaching this
   * exact section+year — the live source of "subject teacher" authorization,
   * never a cached participant row. */
  async findActiveTeachersForSection(
    sectionId: string,
    academicYearId: string,
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
       FROM subject_offering so
       JOIN staff s ON s.id = so.teacher_staff_id AND s.status = 'ACTIVE'
       JOIN person p ON p.id = s.person_id
       WHERE so.section_id = $1 AND so.academic_year_id = $2 AND so.status = 'ACTIVE'`,
      [sectionId, academicYearId],
    );
    return rows.map((row) => ({
      staffId: row.staff_id,
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
    }));
  }

  /** Bulk version of findActiveTeachersForSection -- every ACTIVE subject teacher
   * across many (section, year) pairs in one query, grouped by pair. Feeds
   * MessagingService's bulk list-summary builder: a faculty with many authorized
   * sections would otherwise pay one round trip per distinct section just for
   * this half of the faculty-list derivation. */
  async findActiveTeachersForSections(
    pairs: { sectionId: string; academicYearId: string }[],
    executor: Queryable = this.postgres,
  ): Promise<Map<string, FacultyPersonView[]>> {
    const result = new Map<string, FacultyPersonView[]>();
    if (pairs.length === 0) return result;
    const sectionIds = pairs.map((p) => p.sectionId);
    const yearIds = pairs.map((p) => p.academicYearId);
    const { rows } = await executor.query<{
      section_id: string;
      academic_year_id: string;
      staff_id: string;
      person_id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
    }>(
      `SELECT DISTINCT so.section_id, so.academic_year_id, s.id AS staff_id, p.id AS person_id, p.first_name, p.last_name, p.display_name
       FROM subject_offering so
       JOIN unnest($1::uuid[], $2::uuid[]) AS authorized(section_id, academic_year_id)
         ON authorized.section_id = so.section_id AND authorized.academic_year_id = so.academic_year_id
       JOIN staff s ON s.id = so.teacher_staff_id AND s.status = 'ACTIVE'
       JOIN person p ON p.id = s.person_id
       WHERE so.status = 'ACTIVE'`,
      [sectionIds, yearIds],
    );
    for (const row of rows) {
      const key = `${row.section_id}:${row.academic_year_id}`;
      const view: FacultyPersonView = {
        staffId: row.staff_id,
        personId: row.person_id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
      };
      const existing = result.get(key);
      if (existing) existing.push(view);
      else result.set(key, [view]);
    }
    return result;
  }

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
