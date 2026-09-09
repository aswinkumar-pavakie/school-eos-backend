// The one shared answer to "which classes am I scoped to" -- every Faculty
// feature that needs a class-switcher (Attendance, Student Leave, Records,
// Marks Entry, Homework, Class Results, Class Teacher) reads from here rather
// than each re-deriving its own copy of this join. Two genuinely different
// scopes, matching how a real school actually works (the user's own words):
// a CLASS_ADVISOR owns their section's attendance/leave/discipline duties; a
// subject teacher (subject_offering.teacher_staff_id) owns marks/homework for
// the specific subject they teach there -- the same person can be both, or
// only one, for a given section.
//
// Both queries are copied from the exact same proven pattern already live in
// messaging's ClassAdvisorRepository/SubjectOfferingRepository (private to
// that module) -- reimplemented here, not imported, to avoid coupling two
// unrelated modules on one internal repository (same reasoning
// online-classes' own private copy already uses).
//
// Both are scoped to the CURRENT academic year only -- role_assignment rows
// don't reliably get an expiry date set the moment a year ends, so without
// this a teacher could see last year's classes as if still theirs.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ScopedSection {
  sectionId: string;
  academicYearId: string;
  gradeName: string;
  sectionName: string;
}

export interface CoordinatorScopeRow {
  scopeType: string;
  scopeStage: string | null;
  scopeId: string | null;
}

export interface TeachingOffering {
  subjectOfferingId: string;
  sectionId: string;
  academicYearId: string;
  gradeName: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
}

function mapSection(row: any): ScopedSection {
  return {
    sectionId: row.section_id,
    academicYearId: row.academic_year_id,
    gradeName: row.grade_name,
    sectionName: row.section_name,
  };
}

@Injectable()
export class FacultyScopeRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every section this person is the current, ACTIVE class advisor for, in
   * the current academic year. */
  async getAdvisorSections(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<ScopedSection[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT sec.id AS section_id, sec.academic_year_id, g.name AS grade_name, sec.name AS section_name
       FROM role_assignment ra
       JOIN section sec ON sec.id = ra.scope_id AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       JOIN grade g ON g.id = sec.grade_id
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.person_id = $1 AND ra.status = 'ACTIVE'
       ORDER BY g.name, sec.name`,
      [personId],
    );
    return rows.map(mapSection);
  }

  /** True if this person is the current, ACTIVE class advisor for this exact
   * section (the authorization check every advisor-only feature runs first). */
  async isAdvisorForSection(
    personId: string,
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1
       FROM role_assignment ra
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.person_id = $1 AND ra.scope_id = $2 AND ra.status = 'ACTIVE'`,
      [personId, sectionId],
    );
    return rows.length > 0;
  }

  /** Every subject_offering this person currently, actively teaches, in the
   * current academic year -- the real "switch class" list for Records/Marks
   * Entry/Homework (subject-scoped, not advisor-scoped). */
  async getTeachingOfferings(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<TeachingOffering[]> {
    const { rows } = await executor.query(
      `SELECT so.id AS subject_offering_id, so.section_id, so.academic_year_id,
              g.name AS grade_name, sec.name AS section_name, subj.id AS subject_id, subj.name AS subject_name
       FROM subject_offering so
       JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE' AND st.person_id = $1
       JOIN section sec ON sec.id = so.section_id AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       JOIN grade g ON g.id = sec.grade_id
       JOIN subject subj ON subj.id = so.subject_id
       WHERE so.status = 'ACTIVE'
       ORDER BY g.name, sec.name, subj.name`,
      [personId],
    );
    return rows.map((row: any) => ({
      subjectOfferingId: row.subject_offering_id,
      sectionId: row.section_id,
      academicYearId: row.academic_year_id,
      gradeName: row.grade_name,
      sectionName: row.section_name,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
    }));
  }

  /** This person's own real staff.id -- the "which employee am I" resolution
   * every self-service Faculty feature over a staff_id-keyed table needs
   * (My Attendance, Employee Leave & OD, HR Payroll, Payslip, Appraisal).
   * Null for a person with no ACTIVE staff record (shouldn't happen for a
   * real FACULTY-role login, but never assumed). */
  async getStaffId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT id FROM staff WHERE person_id = $1 AND status = 'ACTIVE'`,
      [personId],
    );
    return rows[0]?.id ?? null;
  }

  /** Every section this person is scoped to at all -- advisor sections UNION
   * teaching sections, deduplicated. The Announcements feature's own "classes
   * I can post to" list (advising and teaching are both legitimate reasons to
   * announce something to a class), and any other feature that just needs
   * "which sections is this person allowed to touch" without caring which
   * scope grants it. */
  async getAllScopedSectionIds(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const [advisorSections, teachingOfferings] = await Promise.all([
      this.getAdvisorSections(personId, executor),
      this.getTeachingOfferings(personId, executor),
    ]);
    const ids = new Set<string>();
    for (const s of advisorSections) ids.add(s.sectionId);
    for (const o of teachingOfferings) ids.add(o.sectionId);
    return [...ids];
  }

  /** Every real schooling stage (grade.stage, e.g. 'HIGHER_SECONDARY') this
   * person's own advisor + teaching sections actually fall under -- the
   * Academic Calendar's own STAGE-scoped event filter reads this. */
  async getRelevantStages(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT g.stage
       FROM grade g
       WHERE g.id IN (
         SELECT sec.grade_id
         FROM role_assignment ra
         JOIN section sec ON sec.id = ra.scope_id AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
         WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION' AND ra.person_id = $1 AND ra.status = 'ACTIVE'
         UNION
         SELECT sec.grade_id
         FROM subject_offering so
         JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE' AND st.person_id = $1
         JOIN section sec ON sec.id = so.section_id AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         WHERE so.status = 'ACTIVE'
       ) AND g.stage IS NOT NULL`,
      [personId],
    );
    return rows.map((r: any) => r.stage);
  }

  /** True if this exact subject_offering belongs to this person (the
   * authorization check every teaching-scoped feature runs first). */
  async ownsOffering(
    personId: string,
    subjectOfferingId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM subject_offering so
       JOIN staff st ON st.id = so.teacher_staff_id AND st.person_id = $1 AND st.status = 'ACTIVE'
       WHERE so.id = $2 AND so.status = 'ACTIVE'`,
      [personId, subjectOfferingId],
    );
    return rows.length > 0;
  }

  /** This person's real, currently-ACTIVE ACADEMIC_COORDINATOR role_assignment
   * rows (if any) -- role_code='ACADEMIC_COORDINATOR' and its STAGE/GRADE/SCHOOL
   * scope_type values already exist in the schema and are already in real use
   * (granted the exact same way as CLASS_ADVISOR, by Admin's own existing
   * role-assignments endpoint) -- nothing new to model here, just read it. A
   * person can hold several rows (e.g. two STAGE grants), so this always
   * returns the raw set; callers resolve it down to concrete grades. */
  async getCoordinatorScope(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<CoordinatorScopeRow[]> {
    const { rows } = await executor.query(
      `SELECT scope_type, scope_stage, scope_id
       FROM role_assignment
       WHERE person_id = $1 AND role_code = 'ACADEMIC_COORDINATOR' AND status = 'ACTIVE'
         AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
      [personId],
    );
    return rows.map((r: any) => ({
      scopeType: r.scope_type,
      scopeStage: r.scope_stage,
      scopeId: r.scope_id,
    }));
  }

  /** True if this exact student is currently taught OR advised by this
   * person -- Parent Meetings' own booking-scope boundary ("only parents of
   * students this faculty actually teaches or advises may book their real
   * schedule"), checked server-side even on the minimal Parent-side creation
   * path, not just assumed from what slots got shown. */
  async teachesOrAdvisesStudent(
    personId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1
       FROM student_enrolment se
       WHERE se.student_id = $2 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         AND (
           EXISTS (
             SELECT 1 FROM role_assignment ra
             JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
             WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION' AND ra.scope_id = se.section_id
               AND ra.person_id = $1 AND ra.status = 'ACTIVE'
           )
           OR EXISTS (
             SELECT 1 FROM subject_offering so
             JOIN staff st ON st.id = so.teacher_staff_id AND st.person_id = $1 AND st.status = 'ACTIVE'
             WHERE so.section_id = se.section_id AND so.status = 'ACTIVE'
           )
         )`,
      [personId, studentId],
    );
    return rows.length > 0;
  }
}
