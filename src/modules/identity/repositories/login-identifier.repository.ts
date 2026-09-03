import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LoginIdentifierRow {
  personId: string;
  identifierType: string;
  value: string;
  isVerified: boolean;
}

@Injectable()
export class LoginIdentifierRepository {
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Looks up a verified identifier by its raw value. Returns null on "not found" and
   * on "found but not verified" alike, and null on the (constraint-prevented in
   * practice, but not assumed away) case of an ambiguous multi-row match — callers
   * must treat every null the same way: "Invalid credentials", never distinguishing
   * why.
   */
  async findVerifiedByValue(
    value: string,
    executor: Queryable = this.postgres,
  ): Promise<LoginIdentifierRow | null> {
    const { rows } = await executor.query<{
      person_id: string;
      identifier_type: string;
      value: string;
      is_verified: boolean;
    }>(
      `SELECT person_id, identifier_type, value, is_verified
       FROM login_identifier
       WHERE value = $1 AND is_verified = true`,
      [value],
    );
    if (rows.length !== 1) return null;
    const row = rows[0];
    return {
      personId: row.person_id,
      identifierType: row.identifier_type,
      value: row.value,
      isVerified: row.is_verified,
    };
  }
}
