// Class Teacher (Advisor) login -- persistent per (grade, section_name),
// reused across whichever faculty member holds it and across academic years.
// See database/migrations/0032_class_teacher_login.sql for the full schema
// reasoning. class_teacher_login is the stable identity; every row in
// class_teacher_login_assignment is one (academic_year, real section_id,
// real faculty_person_id) holder period, with at most one ACTIVE at a time.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ClassTeacherLoginRow {
  loginPersonId: string;
  gradeId: string;
  sectionName: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface ClassTeacherAssignmentRow {
  id: string;
  classTeacherLoginId: string;
  academicYearId: string;
  sectionId: string;
  facultyPersonId: string;
  assignedBy: string | null;
  assignedOn: Date;
  unassignedOn: Date | null;
  status: string;
}

function mapLogin(row: {
  login_person_id: string;
  grade_id: string;
  section_name: string;
  created_by: string | null;
  created_at: Date;
}): ClassTeacherLoginRow {
  return {
    loginPersonId: row.login_person_id,
    gradeId: row.grade_id,
    sectionName: row.section_name,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapAssignment(row: {
  id: string;
  class_teacher_login_id: string;
  academic_year_id: string;
  section_id: string;
  faculty_person_id: string;
  assigned_by: string | null;
  assigned_on: Date;
  unassigned_on: Date | null;
  status: string;
}): ClassTeacherAssignmentRow {
  return {
    id: row.id,
    classTeacherLoginId: row.class_teacher_login_id,
    academicYearId: row.academic_year_id,
    sectionId: row.section_id,
    facultyPersonId: row.faculty_person_id,
    assignedBy: row.assigned_by,
    assignedOn: row.assigned_on,
    unassignedOn: row.unassigned_on,
    status: row.status,
  };
}

/** One row of the admin's seat table: the constant login, who holds it now,
 * and how it lines up with the selected academic year. Never contains a
 * password -- only whether one is stored. */
export interface ClassLoginSeatRow {
  loginPersonId: string;
  gradeId: string;
  gradeName: string;
  sectionName: string;
  email: string | null;
  holderPersonId: string | null;
  holderName: string | null;
  holderEmployeeNo: string | null;
  holderStaffStatus: string | null;
  holderSince: Date | null;
  /** The section the login's CLASS_ADVISOR role points at right now. */
  roleSectionId: string | null;
  /** This grade + section name's row in the selected academic year, if any. */
  targetSectionId: string | null;
  studentCount: number;
  hasStoredPassword: boolean;
  /** Phones/browsers where a teacher added this class account (active links). */
  linkedPhones: number;
}

export interface ClassLoginStudentRow {
  studentId: string;
  name: string;
  rollNo: number | null;
  enrolmentType: string | null;
}

export interface SectionWithoutLoginRow {
  sectionId: string;
  gradeId: string;
  gradeName: string;
  sectionName: string;
}

const ASSIGNMENT_COLUMNS = `id, class_teacher_login_id, academic_year_id, section_id,
  faculty_person_id, assigned_by, assigned_on, unassigned_on, status`;

@Injectable()
export class ClassTeacherLoginRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByGradeSection(
    gradeId: string,
    sectionName: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassTeacherLoginRow | null> {
    const { rows } = await executor.query(
      `SELECT login_person_id, grade_id, section_name, created_by, created_at
       FROM class_teacher_login
       WHERE grade_id = $1 AND section_name = $2`,
      [gradeId, sectionName],
    );
    return rows.length > 0 ? mapLogin(rows[0]) : null;
  }

  async findById(
    loginPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassTeacherLoginRow | null> {
    const { rows } = await executor.query(
      `SELECT login_person_id, grade_id, section_name, created_by, created_at
       FROM class_teacher_login
       WHERE login_person_id = $1`,
      [loginPersonId],
    );
    return rows.length > 0 ? mapLogin(rows[0]) : null;
  }

  async create(
    input: { loginPersonId: string; gradeId: string; sectionName: string; createdBy: string },
    executor: Queryable = this.postgres,
  ): Promise<ClassTeacherLoginRow> {
    const { rows } = await executor.query(
      `INSERT INTO class_teacher_login (login_person_id, grade_id, section_name, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING login_person_id, grade_id, section_name, created_by, created_at`,
      [input.loginPersonId, input.gradeId, input.sectionName, input.createdBy],
    );
    return mapLogin(rows[0]);
  }

  async findActiveAssignment(
    classTeacherLoginId: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassTeacherAssignmentRow | null> {
    const { rows } = await executor.query(
      `SELECT ${ASSIGNMENT_COLUMNS}
       FROM class_teacher_login_assignment
       WHERE class_teacher_login_id = $1 AND status = 'ACTIVE'`,
      [classTeacherLoginId],
    );
    return rows.length > 0 ? mapAssignment(rows[0]) : null;
  }

  /** Every ACTIVE class this faculty member holds (a person can advise
   * several sections), each with its login's email so the mobile switcher
   * can list and prefill them. Never returns a password. */
  async findActiveClassLoginsByFaculty(
    facultyPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ gradeId: string; gradeName: string; sectionName: string; email: string | null }[]> {
    const { rows } = await executor.query(
      `SELECT l.grade_id AS "gradeId", g.name AS "gradeName", l.section_name AS "sectionName",
              (SELECT li.value FROM login_identifier li
                WHERE li.person_id = l.login_person_id AND li.identifier_type = 'EMAIL'
                ORDER BY li.created_at LIMIT 1) AS email
       FROM class_teacher_login_assignment a
       JOIN class_teacher_login l ON l.login_person_id = a.class_teacher_login_id
       JOIN grade g ON g.id = l.grade_id
       WHERE a.faculty_person_id = $1 AND a.status = 'ACTIVE'
       ORDER BY g.name, l.section_name`,
      [facultyPersonId],
    );
    return rows;
  }

  async createAssignment(
    input: {
      classTeacherLoginId: string;
      academicYearId: string;
      sectionId: string;
      facultyPersonId: string;
      assignedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<ClassTeacherAssignmentRow> {
    const { rows } = await executor.query(
      `INSERT INTO class_teacher_login_assignment
         (class_teacher_login_id, academic_year_id, section_id, faculty_person_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${ASSIGNMENT_COLUMNS}`,
      [
        input.classTeacherLoginId,
        input.academicYearId,
        input.sectionId,
        input.facultyPersonId,
        input.assignedBy,
      ],
    );
    return mapAssignment(rows[0]);
  }

  async endActiveAssignment(
    classTeacherLoginId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE class_teacher_login_assignment
       SET status = 'ENDED', unassigned_on = now()
       WHERE class_teacher_login_id = $1 AND status = 'ACTIVE'`,
      [classTeacherLoginId],
    );
  }

  /** Full year-wise holder history for one class-teacher login, newest first. */
  async listHistory(
    classTeacherLoginId: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassTeacherAssignmentRow[]> {
    const { rows } = await executor.query(
      `SELECT ${ASSIGNMENT_COLUMNS}
       FROM class_teacher_login_assignment
       WHERE class_teacher_login_id = $1
       ORDER BY assigned_on DESC`,
      [classTeacherLoginId],
    );
    return rows.map(mapAssignment);
  }

  /** Row-lock the login for the rest of the transaction, so two admins
   * changing the same seat at once are serialised instead of racing. */
  async lockLogin(loginPersonId: string, executor: Queryable): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM class_teacher_login WHERE login_person_id = $1 FOR UPDATE`,
      [loginPersonId],
    );
    return rows.length > 0;
  }

  async findCurrentAcademicYear(
    executor: Queryable = this.postgres,
  ): Promise<{ id: string; name: string } | null> {
    const { rows } = await executor.query(
      `SELECT id, name FROM academic_year WHERE is_current LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  async findAcademicYear(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<{ id: string; name: string; status: string } | null> {
    const { rows } = await executor.query(
      `SELECT id, name, status FROM academic_year WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Every class login with its holder and how it lines up with `targetYearId`. */
  async listSeats(
    targetYearId: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassLoginSeatRow[]> {
    const { rows } = await executor.query(
      `SELECT l.login_person_id, l.grade_id, g.name AS grade_name, l.section_name,
              (SELECT li.value FROM login_identifier li
                WHERE li.person_id = l.login_person_id AND li.identifier_type = 'EMAIL'
                ORDER BY li.created_at LIMIT 1) AS email,
              a.faculty_person_id AS holder_person_id, a.assigned_on AS holder_since,
              trim(hp.first_name || ' ' || coalesce(hp.last_name, '')) AS holder_name,
              hs.employee_no AS holder_employee_no, hs.status AS holder_staff_status,
              ra.scope_id AS role_section_id,
              tsec.id AS target_section_id,
              coalesce((SELECT count(*)::int FROM student_enrolment se
                         WHERE se.section_id = tsec.id AND se.status = 'ACTIVE'), 0) AS student_count,
              (uc.admin_visible_password IS NOT NULL) AS has_stored_password,
              (SELECT count(*)::int FROM account_link k
                WHERE k.linked_person_id = l.login_person_id AND k.revoked_at IS NULL) AS linked_phones
       FROM class_teacher_login l
       JOIN grade g ON g.id = l.grade_id
       LEFT JOIN class_teacher_login_assignment a
              ON a.class_teacher_login_id = l.login_person_id AND a.status = 'ACTIVE'
       LEFT JOIN person hp ON hp.id = a.faculty_person_id
       LEFT JOIN staff hs ON hs.person_id = a.faculty_person_id
       LEFT JOIN LATERAL (
         SELECT r.scope_id FROM role_assignment r
          WHERE r.person_id = l.login_person_id AND r.role_code = 'CLASS_ADVISOR'
            AND r.scope_type = 'SECTION' AND r.status = 'ACTIVE'
          ORDER BY r.created_at DESC LIMIT 1) ra ON true
       LEFT JOIN section tsec
              ON tsec.grade_id = l.grade_id AND tsec.name = l.section_name AND tsec.academic_year_id = $1
       LEFT JOIN user_credential uc ON uc.person_id = l.login_person_id
       ORDER BY g.level_no, l.section_name`,
      [targetYearId],
    );
    return rows.map((r) => ({
      loginPersonId: r.login_person_id,
      gradeId: r.grade_id,
      gradeName: r.grade_name,
      sectionName: r.section_name,
      email: r.email,
      holderPersonId: r.holder_person_id,
      holderName: r.holder_name,
      holderEmployeeNo: r.holder_employee_no,
      holderStaffStatus: r.holder_staff_status,
      holderSince: r.holder_since,
      roleSectionId: r.role_section_id,
      targetSectionId: r.target_section_id,
      studentCount: Number(r.student_count),
      hasStoredPassword: r.has_stored_password === true,
      linkedPhones: Number(r.linked_phones ?? 0),
    }));
  }

  /** Sections of `yearId` that have no class login yet (grade + section name). */
  async listSectionsWithoutLogin(
    yearId: string,
    executor: Queryable = this.postgres,
  ): Promise<SectionWithoutLoginRow[]> {
    const { rows } = await executor.query(
      `SELECT sec.id AS section_id, sec.grade_id, g.name AS grade_name, sec.name AS section_name
       FROM section sec
       JOIN grade g ON g.id = sec.grade_id
       WHERE sec.academic_year_id = $1 AND sec.status = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM class_teacher_login l
                          WHERE l.grade_id = sec.grade_id AND l.section_name = sec.name)
       ORDER BY g.level_no, sec.name`,
      [yearId],
    );
    return rows.map((r) => ({
      sectionId: r.section_id,
      gradeId: r.grade_id,
      gradeName: r.grade_name,
      sectionName: r.section_name,
    }));
  }

  /** This login's section row (same grade + section name) in `yearId`. */
  async findSectionForLoginInYear(
    loginPersonId: string,
    yearId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT sec.id FROM class_teacher_login l
        JOIN section sec ON sec.grade_id = l.grade_id AND sec.name = l.section_name AND sec.academic_year_id = $2
       WHERE l.login_person_id = $1`,
      [loginPersonId, yearId],
    );
    return rows[0]?.id ?? null;
  }

  async listStudents(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<ClassLoginStudentRow[]> {
    const { rows } = await executor.query(
      `SELECT s.id AS student_id, trim(p.first_name || ' ' || coalesce(p.last_name, '')) AS name,
              se.roll_no, se.enrolment_type
       FROM student_enrolment se
       JOIN student s ON s.id = se.student_id
       JOIN person p ON p.id = s.person_id
       WHERE se.section_id = $1 AND se.status = 'ACTIVE'
       ORDER BY se.roll_no NULLS LAST, p.first_name`,
      [sectionId],
    );
    return rows.map((r) => ({
      studentId: r.student_id,
      name: r.name,
      rollNo: r.roll_no,
      enrolmentType: r.enrolment_type,
    }));
  }

  /** The password admin last set (every class login's password is admin-set). */
  async readStoredPassword(
    loginPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT admin_visible_password FROM user_credential WHERE person_id = $1`,
      [loginPersonId],
    );
    return rows[0]?.admin_visible_password ?? null;
  }

  /** An ACTIVE staff member who holds the FACULTY role -- the only kind of
   * person who may stand behind a class login. */
/** The class seat a person currently holds (one class per teacher), if any. */
  async findActiveSeatHeldBy(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ loginPersonId: string; gradeName: string; sectionName: string } | null> {
    const { rows } = await executor.query(
      `SELECT a.class_teacher_login_id AS "loginPersonId", g.name AS "gradeName", l.section_name AS "sectionName"
       FROM class_teacher_login_assignment a
       JOIN class_teacher_login l ON l.login_person_id = a.class_teacher_login_id
       JOIN grade g ON g.id = l.grade_id
       WHERE a.faculty_person_id = $1 AND a.status = 'ACTIVE'
       LIMIT 1`,
      [personId],
    );
    return rows[0] ?? null;
  }

  async isEligibleFaculty(personId: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM staff st
        JOIN v_active_role_assignment ra ON ra.person_id = st.person_id AND ra.role_code = 'FACULTY'
       WHERE st.person_id = $1 AND st.status = 'ACTIVE'
       LIMIT 1`,
      [personId],
    );
    return rows.length > 0;
  }

  /** Whether `personId` is a class-teacher login (keeps the shared login out of
   * self-service password flows). */
  async isClassLogin(personId: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM class_teacher_login WHERE login_person_id = $1`,
      [personId],
    );
    return rows.length > 0;
  }
}
