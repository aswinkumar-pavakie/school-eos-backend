// Private copy — resolves the authenticated actor's own staff.id from their
// person_id. Identical contract to the copies already in messaging/permissions/
// online-classes; kept private to this module rather than importing PeopleModule
// (see those modules' own repositories for why).

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
    return {
      id: rows[0].id,
      personId: rows[0].person_id,
      status: rows[0].status,
    };
  }
}
