import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationRepository } from './repositories/notification.repository';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationRepo: NotificationRepository) {}

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
