// Minimal display-name lookup — used to label the parent in the participant list
// and each message's sender. Kept private to messaging like every other repository
// here (people module is still a stub).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface PersonDisplayView {
  personId: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
}

@Injectable()
export class PersonRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findDisplayName(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<PersonDisplayView | null> {
    const { rows } = await executor.query<{
      id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
    }>(
      `SELECT id, first_name, last_name, display_name FROM person WHERE id = $1`,
      [personId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      personId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
    };
  }

  /** Bulk lookup -- one query for every distinct parent across a whole
   * conversation list, instead of one findDisplayName() per conversation. */
  async findDisplayNames(
    personIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<Map<string, PersonDisplayView>> {
    const result = new Map<string, PersonDisplayView>();
    if (personIds.length === 0) return result;
    const { rows } = await executor.query<{
      id: string;
      first_name: string;
      last_name: string;
      display_name: string | null;
    }>(
      `SELECT id, first_name, last_name, display_name FROM person WHERE id = ANY($1::uuid[])`,
      [personIds],
    );
    for (const row of rows) {
      result.set(row.id, {
        personId: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
      });
    }
    return result;
  }
}
