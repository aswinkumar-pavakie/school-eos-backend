// Read-only — grade is owned by Academics (no such module exists yet), Finance only
// needs it to populate a filter dropdown and to know what a fee structure is for.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface GradeRow {
  id: string;
  name: string;
  levelNo: number;
}

@Injectable()
export class GradeLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(executor: Queryable = this.postgres): Promise<GradeRow[]> {
    const { rows } = await executor.query(
      `SELECT id, name, level_no FROM grade WHERE status = 'ACTIVE' ORDER BY level_no ASC`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      levelNo: r.level_no,
    }));
  }
}
