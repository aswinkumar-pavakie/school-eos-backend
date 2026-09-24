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
  /** The install/browser id the session was created on (X-Device-Id). */
  deviceId: string | null;
  /** Set on a session minted by an account switch: it lives and dies with this one. */
  linkedFromSessionId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface SessionDbRow {
  id: string;
  person_id: string;
  refresh_token_hash: string;
  device_platform: DevicePlatform;
  device_label: string | null;
  device_id: string | null;
  linked_from_session_id: string | null;
  expires_at: Date;
  revoked_at: Date | null;
}

const SESSION_COLUMNS = `id, person_id, refresh_token_hash, device_platform, device_label,
  device_id, linked_from_session_id, expires_at, revoked_at`;

function mapSession(row: SessionDbRow): UserSessionRow {
  return {
    id: row.id,
    personId: row.person_id,
    refreshTokenHash: row.refresh_token_hash,
    devicePlatform: row.device_platform,
    deviceLabel: row.device_label,
    deviceId: row.device_id,
    linkedFromSessionId: row.linked_from_session_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
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
      deviceId?: string | null;
      linkedFromSessionId?: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      expiresAt: Date;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO user_session
         (person_id, refresh_token_hash, device_platform, device_label, device_id,
          linked_from_session_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        params.personId,
        params.refreshTokenHash,
        params.devicePlatform,
        params.deviceLabel,
        params.deviceId ?? null,
        params.linkedFromSessionId ?? null,
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
    const { rows } = await executor.query<SessionDbRow>(
      `SELECT ${SESSION_COLUMNS} FROM user_session WHERE refresh_token_hash = $1`,
      [refreshTokenHash],
    );
    return rows.length === 0 ? null : mapSession(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<UserSessionRow | null> {
    const { rows } = await executor.query<SessionDbRow>(
      `SELECT ${SESSION_COLUMNS} FROM user_session WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : mapSession(rows[0]);
  }

  /** The session a given parent session already minted for `personId` (if any). */
  async findChild(
    parentSessionId: string,
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<UserSessionRow | null> {
    const { rows } = await executor.query<SessionDbRow>(
      `SELECT ${SESSION_COLUMNS} FROM user_session
       WHERE linked_from_session_id = $1 AND person_id = $2
       ORDER BY expires_at DESC LIMIT 1`,
      [parentSessionId, personId],
    );
    return rows.length === 0 ? null : mapSession(rows[0]);
  }

  /** Swaps the refresh token of an existing session (used to hand a session back
   * to its owner after a switch, without minting a second one) and pushes its
   * expiry out. */
  async rotateRefreshToken(
    id: string,
    refreshTokenHash: string,
    expiresAt: Date,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_session SET refresh_token_hash = $2, expires_at = $3 WHERE id = $1`,
      [id, refreshTokenHash, expiresAt],
    );
  }

  /** Sessions created before device ids existed adopt the phone at their next
   * refresh (only the holder of the refresh token can reach this), so nobody has
   * to sign in again just to use account switching. */
  async bindDeviceIfMissing(
    id: string,
    deviceId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_session SET device_id = $2 WHERE id = $1 AND device_id IS NULL`,
      [id, deviceId],
    );
  }

  /** Keeps a parent session alive while its linked child is being used. */
  async extendExpiry(
    id: string,
    expiresAt: Date,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE user_session SET expires_at = GREATEST(expires_at, $2) WHERE id = $1`,
      [id, expiresAt],
    );
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
   * admin) so a credential compromise can't be ridden out on an already-issued session.
   * Sessions minted by an account switch hang off their parent with ON DELETE CASCADE,
   * so they go with it. */
  async deleteAllForPerson(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(`DELETE FROM user_session WHERE person_id = $1`, [
      personId,
    ]);
  }

  /** Signs a person out of one phone/browser only (used when a link is removed). */
  async deleteForPersonOnDevice(
    personId: string,
    deviceId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `DELETE FROM user_session WHERE person_id = $1 AND device_id = $2`,
      [personId, deviceId],
    );
  }
}
