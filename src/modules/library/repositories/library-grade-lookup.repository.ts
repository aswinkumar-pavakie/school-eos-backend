// Read-only -- grade/section are owned by Academics (no such module exists
// yet). Library only needs them to populate the Members filter dropdowns,
// same precedent as finance/master-data/repositories/grade-lookup.repository.ts
// reading `grade` directly rather than duplicating it.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface GradeRow {
  id: string;
  name: string;
}

export interface SectionRow {
  id: string;
  gradeId: string;
  name: string;
}

@Injectable()
export class LibraryGradeLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async listGrades(executor: Queryable = this.postgres): Promise<GradeRow[]> {
    const { rows } = await executor.query<GradeRow>(
      `SELECT id, name FROM grade WHERE status = 'ACTIVE' ORDER BY level_no ASC`,
    );
    return rows;
  }

  /** Scoped to the current academic year -- matches the same scoping the
   * member list's own grade/section join already uses, so this dropdown never
   * offers a section that couldn't actually match any member row. */
  async listSections(
    gradeId: string | undefined,
    executor: Queryable = this.postgres,
  ): Promise<SectionRow[]> {
    const params: unknown[] = [];
    let where = `WHERE status = 'ACTIVE' AND academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)`;
    if (gradeId) {
      params.push(gradeId);
      where += ` AND grade_id = $${params.length}`;
    }
    const { rows } = await executor.query<SectionRow>(
      `SELECT id, grade_id AS "gradeId", name FROM section ${where} ORDER BY name ASC`,
      params,
    );
    return rows;
  }
}
