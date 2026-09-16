// Real, already-existing notification_delivery table (confirmed live: real
// channel CHECK is PUSH/SMS/WHATSAPP/EMAIL/VOICE, real state CHECK is
// QUEUED/SENT/DELIVERED/READ/FAILED/SUPPRESSED, and idx_delivery_pending
// already indexes exactly `WHERE state IN ('QUEUED','FAILED')` -- this table
// was clearly always meant to be read by a poller, not written once and
// forgotten). One row per (notification, channel) -- multiple registered
// devices for the same person are handled inside a single PUSH attempt, not
// as separate delivery rows (there is no per-device column on this table).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export type DeliveryState = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SUPPRESSED';

export interface PendingNotification {
  notificationId: string;
  personId: string;
  notificationType: string;
  title: string;
  body: string;
  deepLink: string | null;
  relatedObjectId: string | null;
  isEmergency: boolean;
}

@Injectable()
export class NotificationDeliveryRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every real notification that has never had a PUSH delivery attempt yet,
   * or whose last attempt FAILED under the retry ceiling -- oldest first, so
   * a backlog drains in order rather than newest-first starving old ones. */
  async findNeedingPushDelivery(maxAttempts: number, limit: number, executor: Queryable = this.postgres): Promise<PendingNotification[]> {
    const { rows } = await executor.query(
      `SELECT n.id AS notification_id, n.person_id, n.notification_type, n.title, n.body,
              n.deep_link, n.related_object_id, n.is_emergency
       FROM notification n
       LEFT JOIN notification_delivery d ON d.notification_id = n.id AND d.channel = 'PUSH'
       WHERE d.id IS NULL OR (d.state = 'FAILED' AND d.attempts < $1)
       ORDER BY n.created_at ASC
       LIMIT $2`,
      [maxAttempts, limit],
    );
    return rows.map((r: any) => ({
      notificationId: r.notification_id,
      personId: r.person_id,
      notificationType: r.notification_type,
      title: r.title,
      body: r.body,
      deepLink: r.deep_link,
      relatedObjectId: r.related_object_id,
      isEmergency: r.is_emergency,
    }));
  }

  /** Upsert-by-notification-id-plus-channel: a FAILED row gets retried in
   * place (attempts incremented), never duplicated into a second row. */
  async upsertAttempt(
    notificationId: string,
    state: DeliveryState,
    input: { providerRef?: string | null; lastError?: string | null } = {},
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const { rows } = await executor.query(`SELECT id, attempts FROM notification_delivery WHERE notification_id = $1 AND channel = 'PUSH'`, [
      notificationId,
    ]);
    if (rows.length) {
      await executor.query(
        `UPDATE notification_delivery
         SET state = $2, provider = 'EXPO', provider_ref = COALESCE($3, provider_ref), last_error = $4,
             attempts = attempts + 1, delivered_at = CASE WHEN $2 IN ('SENT','DELIVERED') THEN now() ELSE delivered_at END
         WHERE id = $1`,
        [rows[0].id, state, input.providerRef ?? null, input.lastError ?? null],
      );
    } else {
      await executor.query(
        `INSERT INTO notification_delivery (notification_id, channel, provider, provider_ref, state, attempts, last_error, delivered_at)
         VALUES ($1, 'PUSH', 'EXPO', $2, $3, 1, $4, CASE WHEN $3 IN ('SENT','DELIVERED') THEN now() ELSE NULL END)`,
        [notificationId, input.providerRef ?? null, state, input.lastError ?? null],
      );
    }
  }
}
