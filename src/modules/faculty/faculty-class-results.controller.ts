import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyClassResultsService } from './faculty-class-results.service';

@Roles('FACULTY')
@Controller('faculty/class-results')
export class FacultyClassResultsController {
  constructor(private readonly service: FacultyClassResultsService) {}

  @Get('sections/:sectionId/exams')
  async listExams(@Param('sectionId', ParseUUIDPipe) sectionId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listExams(actor.personId, sectionId) };
  }

  @Get('sections/:sectionId/exams/:examId')
  async getResults(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getResults(actor.personId, sectionId, examId) };
  }
}
