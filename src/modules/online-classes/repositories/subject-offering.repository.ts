// Narrow, read-only view of `subject_offering` — just enough to validate a faculty's
// scheduling authority (teacher_staff_id match) and to join subject/class/section names
// for display. Full timetable/offering management belongs to the academics module once
// it's built; this repository stays private to online-classes.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SubjectOfferingView {
  id: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherStaffId: string | null;
  status: string;
  subjectName: string;
  sectionName: string;
  gradeName: string;
}

@Injectable()
export class SubjectOfferingRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SubjectOfferingView | null> {
    const { rows } = await executor.query<{
      id: string;
      academic_year_id: string;
      section_id: string;
      subject_id: string;
      teacher_staff_id: string | null;
      status: string;
      subject_name: string;
      section_name: string;
      grade_name: string;
    }>(
      `SELECT so.id, so.academic_year_id, so.section_id, so.subject_id, so.teacher_staff_id, so.status,
              subj.name AS subject_name, sec.name AS section_name, g.name AS grade_name
       FROM subject_offering so
       JOIN subject subj ON subj.id = so.subject_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE so.id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      academicYearId: row.academic_year_id,
      sectionId: row.section_id,
      subjectId: row.subject_id,
      teacherStaffId: row.teacher_staff_id,
      status: row.status,
      subjectName: row.subject_name,
      sectionName: row.section_name,
      gradeName: row.grade_name,
    };
  }

  /**
   * All ACTIVE offerings a given teacher currently teaches — backs the mobile
   * Schedule form's class/section picker so faculty never have to type a raw
   * subject_offering id. Same JOIN as findById, just unfiltered by id and instead
   * scoped to teacher_staff_id (which the caller must have already resolved from
   * the authenticated actor, never a client-supplied value).
   */
  async findAllByTeacherStaffId(
    teacherStaffId: string,
    executor: Queryable = this.postgres,
  ): Promise<SubjectOfferingView[]> {
    const { rows } = await executor.query<{
      id: string;
      academic_year_id: string;
      section_id: string;
      subject_id: string;
      teacher_staff_id: string | null;
      status: string;
      subject_name: string;
      section_name: string;
      grade_name: string;
    }>(
      `SELECT so.id, so.academic_year_id, so.section_id, so.subject_id, so.teacher_staff_id, so.status,
              subj.name AS subject_name, sec.name AS section_name, g.name AS grade_name
       FROM subject_offering so
       JOIN subject subj ON subj.id = so.subject_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE so.teacher_staff_id = $1 AND so.status = 'ACTIVE'
       ORDER BY g.name, sec.name, subj.name`,
      [teacherStaffId],
    );
    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academic_year_id,
      sectionId: row.section_id,
      subjectId: row.subject_id,
      teacherStaffId: row.teacher_staff_id,
      status: row.status,
      subjectName: row.subject_name,
      sectionName: row.section_name,
      gradeName: row.grade_name,
    }));
  }
}
