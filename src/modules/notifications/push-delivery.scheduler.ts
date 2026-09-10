// The real "delivery processor" OutboxService's own header comment says
// "comes later" -- this is that processor. Runs every 15 seconds (a push
// notification feels broken if it's a full minute late, unlike Media Room's
// own once-a-minute auto-publish) and drains every real `notification` row
// that has no PUSH delivery attempt yet (or whose last attempt FAILED, up to
// a retry ceiling) -- writes exactly happen through OutboxService.enqueue()
// already used across the codebase (approvals, attendance-absence alerts,
// hostel class-absence alerts, etc.); this never writes a `notification` row
// itself, only ever a `notification_delivery` one.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isPlausibleExpoPushToken, sendExpoPush } from './expo-push.util';
import { NotificationDeliveryRepository } from './repositories/notification-delivery.repository';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { PersonDeviceTokenRepository } from './repositories/person-device-token.repository';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;

function isWithinQuietHours(from: string | null, to: string | null): boolean {
  if (!from || !to) return false;
  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [fromH, fromM] = from.split(':').map(Number);
  const [toH, toM] = to.split(':').map(Number);
  const fromMinutes = fromH * 60 + fromM;
  const toMinutes = toH * 60 + toM;
  // Quiet window wraps midnight (e.g. 21:00 -> 07:00) in the real, common case.
  if (fromMinutes > toMinutes) return nowMinutes >= fromMinutes || nowMinutes < toMinutes;
  return nowMinutes >= fromMinutes && nowMinutes < toMinutes;
}

@Injectable()
export class PushDeliveryScheduler {
  private readonly logger = new Logger(PushDeliveryScheduler.name);
  // Guards against overlapping runs piling up (each holding a pool
  // connection) if the DB is ever genuinely slow/unreachable for longer than
  // one 15s tick -- confirmed live: a stalled findNeedingPushDelivery under a
  // real network outage let successive ticks accumulate until the pool's
  // connections were all consumed by hung attempts, starving unrelated real
  // requests of a connection. A cron tick that finds one still in flight just
  // skips -- the next tick 15s later picks up exactly where a healthy run
  // would have anyway.
  private isRunning = false;

  constructor(
    private readonly deliveryRepo: NotificationDeliveryRepository,
    private readonly preferenceRepo: NotificationPreferenceRepository,
    private readonly deviceTokenRepo: PersonDeviceTokenRepository,
  ) {}

  @Cron('*/15 * * * * *')
  async dispatchPending(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous push-delivery run still in flight, skipping this tick.');
      return;
    }
    this.isRunning = true;
    try {
      await this.runOnce();
    } finally {
      this.isRunning = false;
    }
  }

  private async runOnce(): Promise<void> {
    const pending = await this.deliveryRepo.findNeedingPushDelivery(MAX_ATTEMPTS, BATCH_SIZE);
    for (const notification of pending) {
      try {
        await this.dispatchOne(notification);
      } catch (err) {
        this.logger.error(
          `Push dispatch crashed for notification ${notification.notificationId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async dispatchOne(notification: Awaited<ReturnType<NotificationDeliveryRepository['findNeedingPushDelivery']>>[number]): Promise<void> {
    const preference = await this.preferenceRepo.getPreference(notification.personId, notification.notificationType);
    if (!preference.channelsEnabled.includes('PUSH')) {
      await this.deliveryRepo.upsertAttempt(notification.notificationId, 'SUPPRESSED', { lastError: 'PUSH channel disabled by preference' });
      return;
    }
    if (!notification.isEmergency && isWithinQuietHours(preference.quietHoursFrom, preference.quietHoursTo)) {
      await this.deliveryRepo.upsertAttempt(notification.notificationId, 'SUPPRESSED', { lastError: 'Within quiet hours' });
      return;
    }

    const tokens = (await this.deviceTokenRepo.findTokensForPerson(notification.personId)).filter(isPlausibleExpoPushToken);
    if (tokens.length === 0) {
      await this.deliveryRepo.upsertAttempt(notification.notificationId, 'SUPPRESSED', { lastError: 'No registered device' });
      return;
    }

    let sentTicketId: string | null = null;
    let lastError: string | null = null;
    for (const token of tokens) {
      try {
        const ticket = await sendExpoPush({
          to: token,
          title: notification.title,
          body: notification.body,
          data: { deepLink: notification.deepLink, notificationType: notification.notificationType, relatedObjectId: notification.relatedObjectId },
          sound: 'default',
          priority: notification.isEmergency ? 'high' : 'default',
        });
        if (ticket.status === 'error') {
          lastError = ticket.message ?? 'Unknown Expo error';
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.deviceTokenRepo.remove(token);
          }
        } else {
          sentTicketId = ticket.id ?? sentTicketId;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (sentTicketId || lastError === null) {
      await this.deliveryRepo.upsertAttempt(notification.notificationId, 'SENT', { providerRef: sentTicketId });
    } else {
      await this.deliveryRepo.upsertAttempt(notification.notificationId, 'FAILED', { lastError });
    }
  }
}
