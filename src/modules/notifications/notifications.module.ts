import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushDeliveryScheduler } from './push-delivery.scheduler';
import { NotificationDeliveryRepository } from './repositories/notification-delivery.repository';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { NotificationRepository } from './repositories/notification.repository';
import { PersonDeviceTokenRepository } from './repositories/person-device-token.repository';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationRepository,
    PersonDeviceTokenRepository,
    NotificationDeliveryRepository,
    NotificationPreferenceRepository,
    PushDeliveryScheduler,
  ],
})
export class NotificationsModule {}
