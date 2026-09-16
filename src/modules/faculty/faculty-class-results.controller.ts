import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SetReportCardRemarkDto } from './dto/set-report-card-remark.dto';
import { FacultyClassResultsService } from './faculty-class-results.service';
import { FacultyReportCardService } from './faculty-report-card.service';

@Roles('FACULTY')
@Controller('faculty/class-results')
export class FacultyClassResultsController {
  constructor(
    private readonly service: FacultyClassResultsService,
    private readonly reportCardService: FacultyReportCardService,
  ) {}

  @Get('sections/:sectionId/exams')
  async listExams(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listExams(actor.personId, sectionId) };
  }

  @Get('sections/:sectionId/exams/:examId')
  async getResults(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getResults(actor.personId, sectionId, examId),
    };
  }

  @Get('sections/:sectionId/exams/:examId/students/:studentId/remark')
  async getRemark(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.reportCardService.getRemark(
        actor.personId,
        sectionId,
        examId,
        studentId,
      ),
    };
  }

  @Patch('sections/:sectionId/exams/:examId/students/:studentId/remark')
  async setRemark(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: SetReportCardRemarkDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.reportCardService.setRemark(
        actor.personId,
        sectionId,
        examId,
        studentId,
        dto.remark,
      ),
    };
  }
}
