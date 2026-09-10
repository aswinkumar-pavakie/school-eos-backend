// New person_device_token table (see database/migrations/0013_push_notifications.sql,
// not yet run) -- one row per real device a person has registered a real
// Expo push token from. A push token is UNIQUE across the whole table (the
// same physical device reinstalling the app, or a different person logging
// in on the same device, must move the token to the new owner, never leave
// two rows pointing at one real device) -- upsert on the token itself, not
// on (person_id, token).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export type DevicePlatform = 'ANDROID' | 'IOS';

@Injectable()
export class PersonDeviceTokenRepository {
  constructor(private readonly postgres: PostgresService) {}

  async upsert(personId: string, expoPushToken: string, platform: DevicePlatform, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `INSERT INTO person_device_token (person_id, expo_push_token, platform, last_seen_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (expo_push_token) DO UPDATE
         SET person_id = EXCLUDED.person_id, platform = EXCLUDED.platform, last_seen_at = now()`,
      [personId, expoPushToken, platform],
    );
  }

  /** Every real token still registered for this person, across every device
   * they've ever logged in from -- a push goes to all of them. */
  async findTokensForPerson(personId: string, executor: Queryable = this.postgres): Promise<string[]> {
    const { rows } = await executor.query(`SELECT expo_push_token FROM person_device_token WHERE person_id = $1`, [personId]);
    return rows.map((r: any) => r.expo_push_token);
  }

  /** Expo's own push receipts can report a token as permanently invalid
   * (uninstalled app, etc.) -- this is how that gets cleaned up, called by
   * the delivery-tracking step, never by a client directly. */
  async remove(expoPushToken: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM person_device_token WHERE expo_push_token = $1`, [expoPushToken]);
  }

  async removeForPerson(personId: string, expoPushToken: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM person_device_token WHERE person_id = $1 AND expo_push_token = $2`, [personId, expoPushToken]);
  }
}
