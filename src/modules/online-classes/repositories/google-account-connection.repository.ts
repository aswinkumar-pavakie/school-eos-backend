// Raw-SQL access to google_account_connection (see 0002_online_classes.sql). Stores
// only ciphertext — encryption/decryption happens in google-token-crypto.util.ts,
// never here.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface GoogleAccountConnectionRow {
  staffId: string;
  googleAccountEmail: string;
  googleUserId: string | null;
  refreshTokenEncrypted: string;
  encryptionKeyId: string | null;
  tokenScope: string;
  status: string;
}

export interface UpsertGoogleConnectionParams {
  staffId: string;
  googleAccountEmail: string;
  googleUserId: string | null;
  refreshTokenEncrypted: string;
  encryptionKeyId: string;
  tokenScope: string;
}

@Injectable()
export class GoogleAccountConnectionRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** One connection per faculty (staff_id is the PK) — reconnecting overwrites the
   * previous tokens rather than erroring, since Google always returns a fresh
   * refresh_token when access_type=offline+prompt=consent are requested. */
  async upsert(
    params: UpsertGoogleConnectionParams,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO google_account_connection
         (staff_id, google_account_email, google_user_id, refresh_token_encrypted,
          encryption_key_id, token_scope, status, connected_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', now(), now())
       ON CONFLICT (staff_id) DO UPDATE SET
         google_account_email = EXCLUDED.google_account_email,
         google_user_id = EXCLUDED.google_user_id,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         encryption_key_id = EXCLUDED.encryption_key_id,
         token_scope = EXCLUDED.token_scope,
         status = 'ACTIVE',
         disconnected_by = NULL,
         disconnected_at = NULL,
         connected_at = now(),
         updated_at = now()`,
      [
        params.staffId,
        params.googleAccountEmail,
        params.googleUserId,
        params.refreshTokenEncrypted,
        params.encryptionKeyId,
        params.tokenScope,
      ],
    );
  }

  /** Google rejected the refresh token itself (invalid_grant — revoked, expired, or the
   * faculty changed their Google password). The stored ciphertext is left in place
   * (harmless, no longer usable) rather than deleted, so reconnecting via /connect just
   * overwrites it the same way any other reconnect does. */
  async markNeedsReauth(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE google_account_connection SET status = 'NEEDS_REAUTH', updated_at = now() WHERE staff_id = $1`,
      [staffId],
    );
  }

  async findByStaffId(
    staffId: string,
    executor: Queryable = this.postgres,
  ): Promise<GoogleAccountConnectionRow | null> {
    const { rows } = await executor.query<{
      staff_id: string;
      google_account_email: string;
      google_user_id: string | null;
      refresh_token_encrypted: string;
      encryption_key_id: string | null;
      token_scope: string;
      status: string;
    }>(
      `SELECT staff_id, google_account_email, google_user_id, refresh_token_encrypted,
              encryption_key_id, token_scope, status
       FROM google_account_connection
       WHERE staff_id = $1`,
      [staffId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      staffId: row.staff_id,
      googleAccountEmail: row.google_account_email,
      googleUserId: row.google_user_id,
      refreshTokenEncrypted: row.refresh_token_encrypted,
      encryptionKeyId: row.encryption_key_id,
      tokenScope: row.token_scope,
      status: row.status,
    };
  }
}
