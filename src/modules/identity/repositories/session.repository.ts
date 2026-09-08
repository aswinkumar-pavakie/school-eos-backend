import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type DevicePlatform = 'WEB' | 'ANDROID' | 'IOS';

export interface UserSessionRow {
  id: string;
  personId: string;
  refreshTokenHash: string;
  devicePlatform: DevicePlatform;
  deviceLabel: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

@Injectable()
export class SessionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    params: {
      personId: string;
      refreshTokenHash: string;
      devicePlatform: DevicePlatform;
      deviceLabel: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      expiresAt: Date;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO user_session
         (person_id, refresh_token_hash, device_platform, device_label, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        params.personId,
        params.refreshTokenHash,
        params.devicePlatform,
        params.deviceLabel,
        params.ipAddress,
        params.userAgent,
        params.expiresAt,
      ],
    );
    return rows[0].id;
  }

  /** Only an unrevoked, unexpired session is a valid match — callers must still check
   * expiresAt/revokedAt themselves rather than trust the query alone, so refresh and
   * logout share one lookup path with identical "not found" semantics. */
  async findByRefreshTokenHash(
    refreshTokenHash: string,
    executor: Queryable = this.postgres,
  ): Promise<UserSessionRow | null> {
    const { rows } = await executor.query<{
      id: string;
      person_id: string;
      refresh_token_hash: string;
      device_platform: DevicePlatform;
      device_label: string | null;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, person_id, refresh_token_hash, device_platform, device_label, expires_at, revoked_at
       FROM user_session
       WHERE refresh_token_hash = $1`,
      [refreshTokenHash],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      personId: row.person_id,
      refreshTokenHash: row.refresh_token_hash,
      devicePlatform: row.device_platform,
      deviceLabel: row.device_label,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async deleteById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(`DELETE FROM user_session WHERE id = $1`, [id]);
  }

  async deleteByRefreshTokenHash(
    refreshTokenHash: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `DELETE FROM user_session WHERE refresh_token_hash = $1`,
      [refreshTokenHash],
    );
  }

  /** Revokes every session for a person — used after a password reset (self-service or
   * admin) so a credential compromise can't be ridden out on an already-issued session. */
  async deleteAllForPerson(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(`DELETE FROM user_session WHERE person_id = $1`, [
      personId,
    ]);
  }
}
