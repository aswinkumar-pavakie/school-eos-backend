// Real academic_term concept -- design-reframe addition (the SIS mockup's
// header shows a real "Term I" pill; no such concept existed anywhere in the
// schema before this, only a free-text `term` string per exam). Minimal,
// read-only: list terms for an academic year, or just the current one. The
// table itself doesn't exist until the user runs the CREATE TABLE + seed
// INSERT in query.md -- until then this returns [] via the controller's own
// PostgresService error surfacing (a relation-does-not-exist error), which
// the frontend already treats as "no terms yet" rather than a hard failure.

import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';

export interface AcademicTermRow {
  id: string;
  academicYearId: string;
  termNumber: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

@Injectable()
export class AcademicTermsService {
  constructor(private readonly postgres: PostgresService) {}

  async list(academicYearId?: string): Promise<AcademicTermRow[]> {
    const { rows } = await this.postgres.query<{
      id: string;
      academic_year_id: string;
      term_number: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
      is_current: boolean;
    }>(
      academicYearId
        ? `SELECT id, academic_year_id, term_number, name, start_date, end_date, is_current
           FROM academic_term WHERE academic_year_id = $1 ORDER BY term_number`
        : `SELECT id, academic_year_id, term_number, name, start_date, end_date, is_current
           FROM academic_term ORDER BY term_number`,
      academicYearId ? [academicYearId] : [],
    );
    return rows.map((r) => ({
      id: r.id,
      academicYearId: r.academic_year_id,
      termNumber: r.term_number,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      isCurrent: r.is_current,
    }));
  }
}
