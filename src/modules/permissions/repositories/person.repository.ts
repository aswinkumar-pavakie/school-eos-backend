// Minimal display-name lookup — used to label who responded to a request. Kept
// private to permissions like every other repository here.

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
}
