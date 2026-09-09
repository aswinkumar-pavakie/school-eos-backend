// Read-only — department is a real academic-department table (HOD-linked), owned by
// Academics (no such module exists yet). Finance/Purchase-Requests only needs it to
// populate a "which department is this for" picker and filter dropdown.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';

export interface DepartmentRow {
  id: string;
  name: string;
}

@Injectable()
export class DepartmentLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(executor: Queryable = this.postgres): Promise<DepartmentRow[]> {
    const { rows } = await executor.query(
      `SELECT id, name FROM department WHERE status = 'ACTIVE' ORDER BY name ASC`,
    );
    return rows.map((r: any) => ({ id: r.id, name: r.name }));
  }
}
