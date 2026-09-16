import { Controller, Get, Param } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyExamScheduleService } from './faculty-exam-schedule.service';

@Roles('FACULTY')
@Controller('faculty/exams')
export class FacultyExamScheduleController {
  constructor(private readonly service: FacultyExamScheduleService) {}

  @Get(':examId/schedule')
  async getSchedule(
    @Param('examId') examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getScheduleForActor(actor.personId, examId),
    };
  }
}
