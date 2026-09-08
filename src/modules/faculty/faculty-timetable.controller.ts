import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyTimetableService } from './faculty-timetable.service';

@Roles('FACULTY')
@Controller('faculty/timetable')
export class FacultyTimetableController {
  constructor(private readonly service: FacultyTimetableService) {}

  @Get()
  async getWeekly(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getWeekly(actor.personId) };
  }
}
