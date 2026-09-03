import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export type OtpPurpose = 'LOGIN' | 'PASSWORD_RESET' | 'PASSWORD_CHANGE' | 'SENSITIVE_ACTION';

export interface OtpChallengeRow {
  id: string;
  personId: string;
  destination: string;
  codeHash: string;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

@Injectable()
export class OtpChallengeRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    personId: string,
    purpose: OtpPurpose,
    destination: string,
    codeHash: string,
    expiresAt: Date,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO otp_challenge (person_id, purpose, destination, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [personId, purpose, destination, codeHash, expiresAt],
    );
    return rows[0].id;
  }

  /** Most recent not-yet-consumed challenge of this purpose for the person, if any. */
  async findLatestPending(
    personId: string,
    purpose: OtpPurpose,
    executor: Queryable = this.postgres,
  ): Promise<OtpChallengeRow | null> {
    const { rows } = await executor.query<{
      id: string;
      person_id: string;
      destination: string;
      code_hash: string;
      attempt_count: number;
      max_attempts: number;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT id, person_id, destination, code_hash, attempt_count, max_attempts, expires_at, consumed_at
       FROM otp_challenge
       WHERE person_id = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY issued_at DESC
       LIMIT 1`,
      [personId, purpose],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      personId: row.person_id,
      destination: row.destination,
      codeHash: row.code_hash,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  /** Only call when attemptCount < maxAttempts (checked by the caller) — the table's
   * CHECK (attempt_count <= max_attempts) would otherwise reject the update. */
  async incrementAttempt(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`UPDATE otp_challenge SET attempt_count = attempt_count + 1 WHERE id = $1`, [
      id,
    ]);
  }

  async markConsumed(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`UPDATE otp_challenge SET consumed_at = now() WHERE id = $1`, [id]);
  }
}
