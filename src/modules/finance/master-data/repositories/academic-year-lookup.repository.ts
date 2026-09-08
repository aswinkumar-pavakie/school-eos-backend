// Read-only — academic_year is owned by Academics (no such module exists yet).
// Finance only needs it to populate a real dropdown wherever a fee structure is
// scoped to a year, instead of asking the caller to type a UUID from memory.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface AcademicYearRow {
  id: string;
  name: string;
  isCurrent: boolean;
}

@Injectable()
export class AcademicYearLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(executor: Queryable = this.postgres): Promise<AcademicYearRow[]> {
    // PLANNED included deliberately — fee structures are routinely set up for next
    // year before it actually starts. CLOSED/ARCHIVED excluded — nothing new gets
    // scoped to a year that's already wrapped up.
    const { rows } = await executor.query(
      `SELECT id, name, is_current FROM academic_year WHERE status IN ('ACTIVE', 'PLANNED') ORDER BY start_date DESC`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      isCurrent: r.is_current,
    }));
  }
}
