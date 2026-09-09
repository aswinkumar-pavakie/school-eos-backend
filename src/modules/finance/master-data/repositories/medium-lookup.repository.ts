// Read-only — medium (English Medium, Tamil Medium, etc.) is owned by Academics (no
// such module exists yet). Finance only needs it to populate the fee structure's
// medium picker.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';

export interface MediumRow {
  id: string;
  name: string;
}

@Injectable()
export class MediumLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(executor: Queryable = this.postgres): Promise<MediumRow[]> {
    const { rows } = await executor.query(
      `SELECT id, name FROM medium WHERE status = 'ACTIVE' ORDER BY name ASC`,
    );
    return rows.map((r: any) => ({ id: r.id, name: r.name }));
  }
}
