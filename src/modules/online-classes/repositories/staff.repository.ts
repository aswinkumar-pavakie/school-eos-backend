// Narrow, auth-scoped read access to `staff` — resolves the authenticated actor's own
// staff.id from their person_id. Full staff/HR CRUD belongs to the people module once
// it's built; this repository stays private to online-classes so the two modules don't
// couple on an unimplemented one (mirrors identity's PersonRepository).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StaffIdentityView {
  id: string;
  personId: string;
  status: string;
  displayName: string;
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
      display_name: string;
    }>(
      `SELECT st.id, st.person_id, st.status, p.display_name
       FROM staff st
       JOIN person p ON p.id = st.person_id
       WHERE st.person_id = $1`,
      [personId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      personId: row.person_id,
      status: row.status,
      displayName: row.display_name,
    };
  }
}
