import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyCalendarService } from './faculty-calendar.service';

@Roles('FACULTY')
@Controller('faculty/calendar')
export class FacultyCalendarController {
  constructor(private readonly service: FacultyCalendarService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }
}
