import { Controller, Get, Param } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyExamScheduleService } from './faculty-exam-schedule.service';

@Roles('FACULTY', 'CLASS_ADVISOR')
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

  // Real "Exams" screen data -- Faculty's own subjects (teaching
  // offerings) and/or a Class Teacher's whole advisor section, unioned.
  // See FacultyExamScheduleService.listExamSubjects's own header note.
  @Get('subjects')
  async listExamSubjects(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listExamSubjects(actor.personId) };
  }

  @Get('subjects/:subjectOfferingId/exam/:examId/marks')
  async getMarksForExamSubject(
    @Param('subjectOfferingId') subjectOfferingId: string,
    @Param('examId') examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getMarksForExamSubject(actor.personId, subjectOfferingId, examId),
    };
  }
}
