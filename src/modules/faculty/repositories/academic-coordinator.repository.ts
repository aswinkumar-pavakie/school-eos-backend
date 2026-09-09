// Academic Coordinator -- real academic-structure browsing, faculty subject
// assignment, and class-advisor assignment, all filtered to the grades the
// caller's own real role_assignment (role_code='ACADEMIC_COORDINATOR')
// resolves to. Every query here takes an already-resolved gradeIds[] list
// (from FacultyAcademicCoordinatorService's own scope resolution) -- this
// repository never re-derives or trusts scope itself, it only ever filters
// by the exact grade set it's given.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CoordinatorGradeRow {
  gradeId: string;
  gradeName: string;
  levelNo: number;
  stage: string;
  sectionCount: number;
  studentCount: number;
}

export interface CoordinatorSectionRow {
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  studentCount: number;
  advisorRoleAssignmentId: string | null;
  advisorPersonId: string | null;
  advisorName: string | null;
}

export interface CoordinatorOfferingRow {
  subjectOfferingId: string;
  sectionId: string;
  gradeName: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  weeklyPeriods: number | null;
  teacherStaffId: string | null;
  teacherPersonId: string | null;
  teacherName: string | null;
}

export interface EligibleFacultyRow {
  staffId: string;
  personId: string;
  name: string;
  designation: string | null;
}

export interface FacultyWorkloadRow {
  staffId: string;
  personId: string;
  name: string;
  offeringCount: number;
  weeklyPeriods: number;
}

@Injectable()
export class AcademicCoordinatorRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findCurrentAcademicYearId(
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `SELECT id FROM academic_year WHERE is_current LIMIT 1`,
    );
    return rows[0].id;
  }

  /** Turns a raw role_assignment scope (some STAGE grants, some explicit
   * GRADE grants, maybe a SCHOOL-wide one) into a concrete, deduplicated
   * list of real grade ids -- the one thing every other query in this file
   * actually filters by. */
  async resolveGradeIdsForScope(
    stages: string[],
    explicitGradeIds: string[],
    schoolWide: boolean,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    if (schoolWide) {
      const { rows } = await executor.query(
        `SELECT id FROM grade WHERE status = 'ACTIVE'`,
      );
      return rows.map((r: any) => r.id);
    }
    if (stages.length === 0 && explicitGradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT DISTINCT id FROM grade WHERE status = 'ACTIVE' AND (stage = ANY($1) OR id = ANY($2))`,
      [stages, explicitGradeIds],
    );
    return rows.map((r: any) => r.id);
  }

  async findGrades(
    gradeIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<CoordinatorGradeRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT g.id AS grade_id, g.name AS grade_name, g.level_no, g.stage,
              COUNT(DISTINCT sec.id) AS section_count,
              COUNT(DISTINCT se.student_id) AS student_count
       FROM grade g
       LEFT JOIN section sec ON sec.grade_id = g.id AND sec.status = 'ACTIVE'
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN student_enrolment se ON se.section_id = sec.id AND se.status = 'ACTIVE'
       WHERE g.id = ANY($1) AND g.status = 'ACTIVE'
       GROUP BY g.id, g.name, g.level_no, g.stage
       ORDER BY g.level_no`,
      [gradeIds],
    );
    return rows.map((r: any) => ({
      gradeId: r.grade_id,
      gradeName: r.grade_name,
      levelNo: r.level_no,
      stage: r.stage,
      sectionCount: Number(r.section_count),
      studentCount: Number(r.student_count),
    }));
  }

  async findSections(
    gradeIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<CoordinatorSectionRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT sec.id AS section_id, sec.name AS section_name, g.id AS grade_id, g.name AS grade_name,
              COUNT(DISTINCT se.student_id) AS student_count,
              ra.id AS advisor_role_assignment_id, ra.person_id AS advisor_person_id,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS advisor_name
       FROM section sec
       JOIN grade g ON g.id = sec.grade_id
       LEFT JOIN student_enrolment se ON se.section_id = sec.id AND se.status = 'ACTIVE'
       LEFT JOIN role_assignment ra ON ra.scope_id = sec.id AND ra.scope_type = 'SECTION'
         AND ra.role_code = 'CLASS_ADVISOR' AND ra.status = 'ACTIVE'
       LEFT JOIN person p ON p.id = ra.person_id
       WHERE g.id = ANY($1) AND sec.status = 'ACTIVE'
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       GROUP BY sec.id, sec.name, g.id, g.name, ra.id, ra.person_id, p.first_name, p.last_name
       ORDER BY g.name, sec.name`,
      [gradeIds],
    );
    return rows.map((r: any) => ({
      sectionId: r.section_id,
      sectionName: r.section_name,
      gradeId: r.grade_id,
      gradeName: r.grade_name,
      studentCount: Number(r.student_count),
      advisorRoleAssignmentId: r.advisor_role_assignment_id,
      advisorPersonId: r.advisor_person_id,
      advisorName: r.advisor_name,
    }));
  }

  async findOfferings(
    gradeIds: string[],
    filter: { gradeId?: string; sectionId?: string },
    executor: Queryable = this.postgres,
  ): Promise<CoordinatorOfferingRow[]> {
    if (gradeIds.length === 0) return [];
    const conditions = [`g.id = ANY($1)`];
    const params: unknown[] = [gradeIds];
    if (filter.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`g.id = $${params.length}`);
    }
    if (filter.sectionId) {
      params.push(filter.sectionId);
      conditions.push(`sec.id = $${params.length}`);
    }
    const { rows } = await executor.query(
      `SELECT so.id AS subject_offering_id, sec.id AS section_id, g.name AS grade_name, sec.name AS section_name,
              subj.id AS subject_id, subj.name AS subject_name, so.weekly_periods,
              st.id AS teacher_staff_id, st.person_id AS teacher_person_id,
              (tp.first_name || COALESCE(' ' || tp.last_name, '')) AS teacher_name
       FROM subject_offering so
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       JOIN subject subj ON subj.id = so.subject_id
       LEFT JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
       LEFT JOIN person tp ON tp.id = st.person_id
       WHERE so.status = 'ACTIVE' AND ${conditions.join(' AND ')}
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       ORDER BY g.name, sec.name, subj.name`,
      params,
    );
    return rows.map((r: any) => ({
      subjectOfferingId: r.subject_offering_id,
      sectionId: r.section_id,
      gradeName: r.grade_name,
      sectionName: r.section_name,
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      weeklyPeriods: r.weekly_periods,
      teacherStaffId: r.teacher_staff_id,
      teacherPersonId: r.teacher_person_id,
      teacherName: r.teacher_name,
    }));
  }

  async isEligibleFacultyStaff(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM staff st JOIN role_assignment ra ON ra.person_id = st.person_id AND ra.role_code = 'FACULTY' AND ra.status = 'ACTIVE'
       WHERE st.id = $1 AND st.status = 'ACTIVE'`,
      [staffId],
    );
    return rows.length > 0;
  }

  async isEligibleFacultyPerson(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT st.id FROM staff st JOIN role_assignment ra ON ra.person_id = st.person_id AND ra.role_code = 'FACULTY' AND ra.status = 'ACTIVE'
       WHERE st.person_id = $1 AND st.status = 'ACTIVE'`,
      [personId],
    );
    return rows[0]?.id ?? null;
  }

  async findOfferingById(
    offeringId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ sectionId: string; gradeId: string } | null> {
    const { rows } = await executor.query(
      `SELECT sec.id AS section_id, g.id AS grade_id
       FROM subject_offering so JOIN section sec ON sec.id = so.section_id JOIN grade g ON g.id = sec.grade_id
       WHERE so.id = $1`,
      [offeringId],
    );
    return rows[0]
      ? { sectionId: rows[0].section_id, gradeId: rows[0].grade_id }
      : null;
  }

  async updateOfferingTeacher(
    offeringId: string,
    teacherStaffId: string | null,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE subject_offering SET teacher_staff_id = $2, updated_at = now() WHERE id = $1`,
      [offeringId, teacherStaffId],
    );
  }

  /** Every active FACULTY-role staff member, for an assignment picker. Not
   * scope-filtered -- a coordinator may reasonably bring in any eligible
   * faculty member to teach a class in their scope. */
  async findEligibleFaculty(
    executor: Queryable = this.postgres,
  ): Promise<EligibleFacultyRow[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT st.id AS staff_id, p.id AS person_id, (p.first_name || COALESCE(' ' || p.last_name, '')) AS name, st.designation
       FROM staff st
       JOIN person p ON p.id = st.person_id
       JOIN role_assignment ra ON ra.person_id = p.id AND ra.role_code = 'FACULTY' AND ra.status = 'ACTIVE'
       WHERE st.status = 'ACTIVE'
       ORDER BY name`,
    );
    return rows.map((r: any) => ({
      staffId: r.staff_id,
      personId: r.person_id,
      name: r.name,
      designation: r.designation,
    }));
  }

  async findFacultyWorkload(
    gradeIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<FacultyWorkloadRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT st.id AS staff_id, p.id AS person_id, (p.first_name || COALESCE(' ' || p.last_name, '')) AS name,
              COUNT(so.id) AS offering_count, COALESCE(SUM(so.weekly_periods), 0) AS weekly_periods
       FROM subject_offering so
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
       JOIN person p ON p.id = st.person_id
       WHERE so.status = 'ACTIVE' AND g.id = ANY($1)
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       GROUP BY st.id, p.id, p.first_name, p.last_name
       ORDER BY name`,
      [gradeIds],
    );
    return rows.map((r: any) => ({
      staffId: r.staff_id,
      personId: r.person_id,
      name: r.name,
      offeringCount: Number(r.offering_count),
      weeklyPeriods: Number(r.weekly_periods),
    }));
  }

  async findActiveAdvisorForSection(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT id FROM role_assignment WHERE scope_type = 'SECTION' AND scope_id = $1 AND role_code = 'CLASS_ADVISOR' AND status = 'ACTIVE'`,
      [sectionId],
    );
    return rows[0]?.id ?? null;
  }

  async revokeRoleAssignment(
    id: string,
    revokedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE role_assignment SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, updated_at = now() WHERE id = $1 AND status = 'ACTIVE'`,
      [id, revokedBy],
    );
  }

  async createClassAdvisorAssignment(
    sectionId: string,
    personId: string,
    assignedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO role_assignment (person_id, role_code, scope_type, scope_id, assigned_by)
       VALUES ($1, 'CLASS_ADVISOR', 'SECTION', $2, $3)
       RETURNING id`,
      [personId, sectionId, assignedBy],
    );
    return rows[0].id;
  }
}
