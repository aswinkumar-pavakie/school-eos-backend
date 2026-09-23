import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyTimetableService } from './faculty-timetable.service';

@Roles('FACULTY', 'CLASS_ADVISOR')
@Controller('faculty/timetable')
export class FacultyTimetableController {
  constructor(private readonly service: FacultyTimetableService) {}

  @Get()
  async getWeekly(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getWeekly(actor.personId) };
  }

  // A Class Teacher (Advisor)'s own class-wide timetable -- see
  // FacultyTimetableService.getForAdvisorSection's own header note for why
  // this is a separate endpoint from the plain GET above.
  @Get('section')
  async getForAdvisorSection(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getForAdvisorSection(actor.personId) };
  }
}
