// reset_allowance_used exists on user_credential (confirmed live) -- the migration
// at database/migrations/0001_user_credential_reset_allowance.sql has been applied.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface UserCredentialRow {
  personId: string;
  passwordHash: string;
  failedAttemptCount: number;
  lockedUntil: Date | null;
  resetAllowanceUsed: boolean;
}

@Injectable()
export class UserCredentialRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<UserCredentialRow | null> {
    const { rows } = await executor.query<{
      person_id: string;
      password_hash: string;
      failed_attempt_count: number;
      locked_until: Date | null;
      reset_allowance_used: boolean;
    }>(
      `SELECT person_id, password_hash, failed_attempt_count, locked_until, reset_allowance_used
       FROM user_credential
       WHERE person_id = $1`,
      [personId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      personId: row.person_id,
      passwordHash: row.password_hash,
      failedAttemptCount: row.failed_attempt_count,
      lockedUntil: row.locked_until,
      resetAllowanceUsed: row.reset_allowance_used,
    };
  }

  /**
   * Atomically increments failed_attempt_count and, if the new count reaches
   * `lockoutThreshold`, sets locked_until = now() + lockoutMinutes. One statement, so
   * concurrent failed attempts can't race past the threshold.
   */
  async recordFailedAttempt(
    personId: string,
    lockoutThreshold: number,
    lockoutMinutes: number,
    executor: Queryable = this.postgres,
  ): Promise<{ failedAttemptCount: number; lockedUntil: Date | null }> {
    const { rows } = await executor.query<{
      failed_attempt_count: number;
      locked_until: Date | null;
    }>(
      `UPDATE user_credential
       SET failed_attempt_count = failed_attempt_count + 1,
           locked_until = CASE
             WHEN failed_attempt_count + 1 >= $2
               THEN now() + ($3::int * interval '1 minute')
             ELSE locked_until
           END,
           updated_at = now()
       WHERE person_id = $1
       RETURNING failed_attempt_count, locked_until`,
      [personId, lockoutThreshold, lockoutMinutes],
    );
    const row = rows[0];
    return {
      failedAttemptCount: row.failed_attempt_count,
      lockedUntil: row.locked_until,
    };
  }

  async recordSuccessfulLogin(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_credential
       SET failed_attempt_count = 0,
           locked_until = NULL,
           last_login_at = now(),
           updated_at = now()
       WHERE person_id = $1`,
      [personId],
    );
  }

  /** Self-service completion: sets the new hash and consumes the one-time allowance. */
  async completeSelfServiceReset(
    personId: string,
    passwordHash: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_credential
       SET password_hash = $2,
           password_algo = 'argon2id',
           password_set_at = now(),
           password_change_count = password_change_count + 1,
           must_change_password = false,
           failed_attempt_count = 0,
           locked_until = NULL,
           reset_allowance_used = true,
           updated_at = now()
       WHERE person_id = $1`,
      [personId, passwordHash],
    );
  }

  /** Admin-issued reset: sets a new hash and clears the allowance so self-service reopens. */
  async completeAdminReset(
    personId: string,
    passwordHash: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_credential
       SET password_hash = $2,
           password_algo = 'argon2id',
           password_set_at = now(),
           password_change_count = password_change_count + 1,
           must_change_password = true,
           failed_attempt_count = 0,
           locked_until = NULL,
           reset_allowance_used = false,
           updated_at = now()
       WHERE person_id = $1`,
      [personId, passwordHash],
    );
  }

  /** First credential row for a newly-created person (Access module's Create User flow). */
  async createInitial(
    personId: string,
    passwordHash: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO user_credential (person_id, password_hash, must_change_password)
       VALUES ($1, $2, true)`,
      [personId, passwordHash],
    );
  }

  /**
   * General admin-authorized reset for ANY account (Access module). Functionally the
   * same core action as completeAdminReset, but only clears reset_allowance_used when
   * the caller says the target holds a role whose own profile page exposes an
   * admin re-reset once the allowance is used up (Parent, Faculty) -- for every
   * other role that flag is never read by anything, so it's left untouched
   * rather than flipped to a value nothing consumes.
   */
  async generalPasswordReset(
    personId: string,
    passwordHash: string,
    clearResetAllowance: boolean,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_credential
       SET password_hash = $2,
           password_algo = 'argon2id',
           password_set_at = now(),
           password_change_count = password_change_count + 1,
           must_change_password = true,
           failed_attempt_count = 0,
           locked_until = NULL,
           reset_allowance_used = CASE WHEN $3 THEN false ELSE reset_allowance_used END,
           updated_at = now()
       WHERE person_id = $1`,
      [personId, passwordHash, clearResetAllowance],
    );
  }
}
