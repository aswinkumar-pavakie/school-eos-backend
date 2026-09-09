import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

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

  /** The login value(s) a person actually signs in with -- distinct from
   * person.mobile/email, which is just contact info and can drift out of sync
   * with what they log in with (e.g. a new phone number update that never
   * touched login_identifier). Used to show "what they actually log in with" on
   * a profile, not their current contact number. */
  async findByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<LoginIdentifierRow[]> {
    const { rows } = await executor.query<{
      person_id: string;
      identifier_type: string;
      value: string;
      is_verified: boolean;
    }>(
      `SELECT person_id, identifier_type, value, is_verified
       FROM login_identifier
       WHERE person_id = $1`,
      [personId],
    );
    return rows.map((row) => ({
      personId: row.person_id,
      identifierType: row.identifier_type,
      value: row.value,
      isVerified: row.is_verified,
    }));
  }

  /** Admin-created accounts (Access module's Create User flow) are pre-verified --
   * there's no separate verification step for a login identifier Admin typed in
   * themselves, unlike a self-service signup flow this product doesn't have. */
  async create(
    personId: string,
    identifierType: 'EMAIL' | 'MOBILE',
    value: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO login_identifier (person_id, identifier_type, value, is_verified, verified_at)
       VALUES ($1, $2, $3, true, now())`,
      [personId, identifierType, value],
    );
  }
}
