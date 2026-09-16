import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationRepository } from './repositories/notification.repository';
import { isPlausibleExpoPushToken } from './expo-push.util';
import { DevicePlatform, PersonDeviceTokenRepository } from './repositories/person-device-token.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly deviceTokenRepo: PersonDeviceTokenRepository,
  ) {}

  /** Called once per real login (and again any time Expo hands the app a
   * fresh token, e.g. after a reinstall) -- this is the "for every login"
   * hook: the mobile app registers its own real Expo push token right after
   * a successful sign-in, so PushDeliveryScheduler has something real to
   * send to the next time this person is notified of anything. */
  async registerDeviceToken(personId: string, expoPushToken: string, platform: DevicePlatform): Promise<void> {
    if (!isPlausibleExpoPushToken(expoPushToken)) {
      throw new ForbiddenException('Not a real Expo push token.');
    }
    await this.deviceTokenRepo.upsert(personId, expoPushToken, platform);
  }

  async unregisterDeviceToken(personId: string, expoPushToken: string): Promise<void> {
    await this.deviceTokenRepo.removeForPerson(personId, expoPushToken);
  }

  async list(personId: string, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const { rows, total } = await this.notificationRepo.findForPerson(personId, {
      unreadOnly: query.unreadOnly === 'true',
      limit,
      offset: (page - 1) * limit,
    });
    const unreadCount = await this.notificationRepo.countUnread(personId);
    return { data: rows, meta: { page, limit, total, unreadCount } };
  }

  /** Any authenticated person can only mark THEIR OWN notification read --
   * the id alone is never proof of ownership; personId always comes from
   * the authenticated session, never the client. */
  async markRead(id: string, personId: string) {
    const existing = await this.notificationRepo.findById(id);
    if (!existing) throw new NotFoundException('Notification not found');
    if (existing.personId !== personId) {
      throw new ForbiddenException('This notification does not belong to you');
    }
    return this.notificationRepo.markRead(id);
  }
}
