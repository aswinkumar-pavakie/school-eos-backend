// Narrow, read-only lookup — validates that a client-supplied sectionId actually
// belongs to the client-supplied academicYearId (a section is itself year-scoped;
// this project doesn't share one section row across years), and provides
// grade/section display names.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SectionView {
  id: string;
  academicYearId: string;
  gradeName: string;
  sectionName: string;
}

@Injectable()
export class SectionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SectionView | null> {
    const { rows } = await executor.query<{
      id: string;
      academic_year_id: string;
      grade_name: string;
      section_name: string;
    }>(
      `SELECT sec.id, sec.academic_year_id, g.name AS grade_name, sec.name AS section_name
       FROM section sec
       JOIN grade g ON g.id = sec.grade_id
       WHERE sec.id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      academicYearId: row.academic_year_id,
      gradeName: row.grade_name,
      sectionName: row.section_name,
    };
  }
}
