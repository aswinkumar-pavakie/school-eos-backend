import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentHealthService } from './parent-health.service';

@Roles('PARENT')
@Controller('parent/students/:studentId/health')
export class ParentHealthController {
  constructor(private readonly service: ParentHealthService) {}

  @Get()
  async getOverview(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getOverview(actor.personId, studentId) };
  }
}
