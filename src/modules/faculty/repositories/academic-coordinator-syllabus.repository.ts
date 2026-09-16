// Real syllabus_unit/syllabus_progress tables -- already populated (336
// units / 1344 progress rows across this database), already read the exact
// same way by Parent's own "Subjects + syllabus progress" screen (see
// parent-academic.repository.ts's own findSyllabusProgress) -- this reuses
// that identical done/total-count computation, just rolled up across every
// subject_offering in a coordinator's own scoped grades instead of one
// child's one subject.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SyllabusCoverageRow {
  subjectOfferingId: string;
  gradeName: string;
  sectionName: string;
  subjectName: string;
  teacherName: string | null;
  doneUnits: number;
  totalUnits: number;
  percent: number;
  behindUnits: number;
}

@Injectable()
export class AcademicCoordinatorSyllabusRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findCoverageForGrades(
    gradeIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<SyllabusCoverageRow[]> {
    if (gradeIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT so.id AS subject_offering_id, g.name AS grade_name, sec.name AS section_name,
              subj.name AS subject_name,
              (st_p.first_name || COALESCE(' ' || st_p.last_name, '')) AS teacher_name,
              count(su.id) FILTER (WHERE sp.status = 'COMPLETED') AS done_units,
              count(su.id) AS total_units,
              count(su.id) FILTER (
                WHERE sp.status IS DISTINCT FROM 'COMPLETED' AND su.expected_completion < now()
              ) AS behind_units
       FROM subject_offering so
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       JOIN subject subj ON subj.id = so.subject_id
       LEFT JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
       LEFT JOIN person st_p ON st_p.id = st.person_id
       LEFT JOIN syllabus_unit su ON su.subject_id = so.subject_id AND su.grade_id = g.id
       LEFT JOIN syllabus_progress sp ON sp.syllabus_unit_id = su.id AND sp.subject_offering_id = so.id
       WHERE so.status = 'ACTIVE' AND g.id = ANY($1)
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       GROUP BY so.id, g.name, g.level_no, sec.name, subj.name, st_p.first_name, st_p.last_name
       ORDER BY g.level_no, sec.name, subj.name`,
      [gradeIds],
    );
    return rows.map((r: any) => {
      const total = Number(r.total_units);
      const done = Number(r.done_units);
      return {
        subjectOfferingId: r.subject_offering_id,
        gradeName: r.grade_name,
        sectionName: r.section_name,
        subjectName: r.subject_name,
        teacherName: r.teacher_name ?? null,
        doneUnits: done,
        totalUnits: total,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
        behindUnits: Number(r.behind_units),
      };
    });
  }
}
