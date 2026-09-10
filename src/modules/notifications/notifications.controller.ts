import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsService } from './notifications.service';

// "My notifications" -- deliberately carries NO @Roles() decorator, same
// convention as approvals.controller.ts (see RolesGuard's own comment: "a
// route with no @Roles() metadata... is allowed through -- role restriction
// is opt-in per route, identity verification is not"). Notifications are
// inherently personal (notification.person_id), never role-scoped, so
// there is no role to gate here -- every real check is
// personId === authenticated actor's own personId, enforced in the service,
// never a client-supplied id. This is the first read access to the
// `notification` table anywhere in the backend; OutboxService (the only
// existing writer) is completely untouched.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@Query() query: NotificationQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    return this.notificationsService.list(actor.personId, query);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.notificationsService.markRead(id, actor.personId) };
  }

  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  async registerDeviceToken(@Body() dto: RegisterDeviceTokenDto, @CurrentActor() actor: AuthenticatedUser) {
    await this.notificationsService.registerDeviceToken(actor.personId, dto.expoPushToken, dto.platform);
    return { data: { registered: true } };
  }

  @Delete('device-token/:token')
  @HttpCode(HttpStatus.OK)
  async unregisterDeviceToken(@Param('token') token: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.notificationsService.unregisterDeviceToken(actor.personId, decodeURIComponent(token));
    return { data: { unregistered: true } };
  }
}
