// New table staff_feedback_response (see database/migrations/0011_parent_module.sql,
// not yet run) -- one rating (1-5) per subject_offering+student, submitted by
// a guardian. Never exposed to Faculty/Admin in this build (out of scope,
// per the user's own "only do Parent side" instruction) -- Parent only ever
// sees and edits their own submitted rating, never anyone else's or an
// aggregate.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface FeedbackSubjectRow {
  subjectOfferingId: string;
  subjectName: string;
  teacherName: string | null;
  myRating: number | null;
}

@Injectable()
export class ParentFeedbackRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findCurrentTermSubjects(studentId: string, executor: Queryable = this.postgres): Promise<FeedbackSubjectRow[]> {
    const { rows } = await executor.query(
      `SELECT so.id AS subject_offering_id, subj.name AS subject_name,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS teacher_name,
              sfr.rating AS my_rating
       FROM student_enrolment se
       JOIN subject_offering so ON so.section_id = se.section_id AND so.status = 'ACTIVE'
       JOIN subject subj ON subj.id = so.subject_id
       LEFT JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
       LEFT JOIN person p ON p.id = st.person_id
       LEFT JOIN staff_feedback_response sfr ON sfr.subject_offering_id = so.id AND sfr.student_id = se.student_id
       WHERE se.student_id = $1 AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       ORDER BY subj.name`,
      [studentId],
    );
    return rows.map((r: any) => ({
      subjectOfferingId: r.subject_offering_id,
      subjectName: r.subject_name,
      teacherName: r.teacher_name,
      myRating: r.my_rating === null ? null : Number(r.my_rating),
    }));
  }

  async upsertRating(
    input: { subjectOfferingId: string; studentId: string; rating: number; submittedBy: string },
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO staff_feedback_response (subject_offering_id, student_id, rating, submitted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (subject_offering_id, student_id) DO UPDATE
         SET rating = EXCLUDED.rating, submitted_by = EXCLUDED.submitted_by`,
      [input.subjectOfferingId, input.studentId, input.rating, input.submittedBy],
    );
  }
}
