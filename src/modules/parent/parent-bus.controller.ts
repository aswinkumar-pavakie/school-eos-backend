import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentBusService } from './parent-bus.service';

@Roles('PARENT')
@Controller('parent/students/:studentId/bus')
export class ParentBusController {
  constructor(private readonly service: ParentBusService) {}

  @Get()
  async getAllocation(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getAllocation(actor.personId, studentId),
    };
  }
}
