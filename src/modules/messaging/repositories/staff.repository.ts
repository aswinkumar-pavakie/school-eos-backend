// Resolves the authenticated actor's own staff.id from their person_id — identical
// contract to online-classes' private copy (same reasoning: people module is still
// a stub, so this stays private here too).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StaffIdentityView {
  id: string;
  personId: string;
  status: string;
}

@Injectable()
export class StaffRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffIdentityView | null> {
    const { rows } = await executor.query<{
      id: string;
      person_id: string;
      status: string;
    }>(`SELECT id, person_id, status FROM staff WHERE person_id = $1`, [
      personId,
    ]);
    if (rows.length === 0) return null;
    const row = rows[0];
    return { id: row.id, personId: row.person_id, status: row.status };
  }
}
