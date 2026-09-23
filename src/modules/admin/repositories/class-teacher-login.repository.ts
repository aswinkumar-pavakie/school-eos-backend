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

  /** The one thing Faculty's own "can I switch?" check needs -- this faculty
   * member's current ACTIVE class-teacher assignment, if any, plus which
   * login it belongs to. */
  async findActiveAssignmentByFaculty(
    facultyPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<(ClassTeacherAssignmentRow & { gradeId: string; sectionName: string }) | null> {
    const { rows } = await executor.query(
      `SELECT a.id, a.class_teacher_login_id, a.academic_year_id, a.section_id,
              a.faculty_person_id, a.assigned_by, a.assigned_on, a.unassigned_on, a.status,
              l.grade_id, l.section_name
       FROM class_teacher_login_assignment a
       JOIN class_teacher_login l ON l.login_person_id = a.class_teacher_login_id
       WHERE a.faculty_person_id = $1 AND a.status = 'ACTIVE'`,
      [facultyPersonId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...mapAssignment(row),
      gradeId: row.grade_id,
      sectionName: row.section_name,
    };
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
}
