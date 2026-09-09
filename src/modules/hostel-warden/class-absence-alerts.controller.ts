import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ClassAbsenceAlertsService } from './class-absence-alerts.service';
import { ClassAbsenceAlertQueryDto } from './dto/class-absence-alert-query.dto';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/class-absence-alerts')
export class ClassAbsenceAlertsController {
  constructor(private readonly service: ClassAbsenceAlertsService) {}

  @Get()
  async list(
    @Query() query: ClassAbsenceAlertQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listAlerts(actor.personId, query.date) };
  }
}
