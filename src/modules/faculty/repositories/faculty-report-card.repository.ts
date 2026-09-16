import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ReportCardLineInput {
  subjectName: string;
  marksObtained: number | null;
  maxMarks: number;
}

export interface UpsertReportCardInput {
  studentId: string;
  academicYearId: string;
  term: string;
  totalMarks: number | null;
  percentage: number | null;
  classRank: number | null;
  advisorRemark: string;
  generatedBy: string;
  lines: ReportCardLineInput[];
}

// report_card/report_card_line are real, already-live tables (no migration
// here) that, before this, had zero application code anywhere touching them
// -- see this feature's own service-level comment for why. Every value
// written here is real: total/percentage/rank come from this exact exam's
// already-computed class results (FacultyClassResultsService.getResults),
// never invented. Genuinely unavailable fields (pdf_object_key, sign-off)
// are left null rather than faked -- this is a remark-and-real-snapshot
// write, not report-card generation with PDF export or a sign-off workflow,
// which stay real, separate, larger scope.
@Injectable()
export class FacultyReportCardRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getRemark(
    studentId: string,
    academicYearId: string,
    term: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ advisor_remark: string | null }>(
      `SELECT advisor_remark FROM report_card WHERE student_id = $1 AND academic_year_id = $2 AND term = $3`,
      [studentId, academicYearId, term],
    );
    return rows[0]?.advisor_remark ?? null;
  }

  async upsertRemark(
    input: UpsertReportCardInput,
    executor: Queryable,
  ): Promise<void> {
    const { rows: existing } = await executor.query<{ id: string }>(
      `SELECT id FROM report_card WHERE student_id = $1 AND academic_year_id = $2 AND term = $3`,
      [input.studentId, input.academicYearId, input.term],
    );

    let reportCardId: string;
    const snapshot = JSON.stringify(input.lines);
    if (existing.length > 0) {
      reportCardId = existing[0].id;
      await executor.query(
        `UPDATE report_card
         SET total_marks = $2, percentage = $3, class_rank = $4, advisor_remark = $5,
             generated_by = $6, generated_at = now(), snapshot = $7
         WHERE id = $1`,
        [
          reportCardId,
          input.totalMarks,
          input.percentage,
          input.classRank,
          input.advisorRemark,
          input.generatedBy,
          snapshot,
        ],
      );
      await executor.query(
        `DELETE FROM report_card_line WHERE report_card_id = $1`,
        [reportCardId],
      );
    } else {
      const { rows: created } = await executor.query<{ id: string }>(
        `INSERT INTO report_card
           (student_id, academic_year_id, term, snapshot, total_marks, percentage, class_rank, advisor_remark, generated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          input.studentId,
          input.academicYearId,
          input.term,
          snapshot,
          input.totalMarks,
          input.percentage,
          input.classRank,
          input.advisorRemark,
          input.generatedBy,
        ],
      );
      reportCardId = created[0].id;
    }

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      await executor.query(
        `INSERT INTO report_card_line
           (report_card_id, subject_name_snapshot, marks_obtained, max_marks, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [reportCardId, line.subjectName, line.marksObtained, line.maxMarks, i],
      );
    }
  }
}
