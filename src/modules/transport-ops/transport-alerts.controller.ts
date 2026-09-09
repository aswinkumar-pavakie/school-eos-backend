import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { TransportAlertsQueryDto } from './dto/transport-alerts-query.dto';
import { TransportAlertsService } from './transport-alerts.service';

@Roles('ADMIN', 'TRANSPORT_MANAGER')
@Controller('transport-ops/alerts')
export class TransportAlertsController {
  constructor(private readonly alertsService: TransportAlertsService) {}

  @Get()
  async list(@Query() query: TransportAlertsQueryDto) {
    return this.alertsService.list(query);
  }

  @Post(':id/acknowledge')
  async acknowledge(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.alertsService.acknowledge(id, actor.personId) };
  }
}
