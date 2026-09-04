// Narrow, auth-scoped read access to `person` — just the fields login/me/password-reset
// need. Full person CRUD belongs to the people module once it's built; this repository
// stays private to identity so the two modules don't couple on an unimplemented one.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface PersonAuthView {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  status: string;
}

@Injectable()
export class PersonRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findById(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<PersonAuthView | null> {
    const { rows } = await executor.query<{
      id: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      mobile: string | null;
      status: string;
    }>(
      `SELECT id, first_name, last_name, email, mobile, status
       FROM person
       WHERE id = $1`,
      [personId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      mobile: row.mobile,
      status: row.status,
    };
  }
}
