import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MediaDashboardService } from './media-dashboard.service';

@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/dashboard')
export class MediaDashboardController {
  constructor(private readonly service: MediaDashboardService) {}

  @Get()
  async summary(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.summary(actor) };
  }
}
