import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SaveMarksDto } from './dto/save-marks.dto';
import { CorrectMarkDto } from './dto/correct-mark.dto';
import { FacultyMarksService } from './faculty-marks.service';

@Roles('FACULTY')
@Controller('faculty/marks')
export class FacultyMarksController {
  constructor(private readonly service: FacultyMarksService) {}

  @Get('offerings/:subjectOfferingId/exams')
  async listExams(
    @Param('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.listExamsForOffering(
        actor.personId,
        subjectOfferingId,
      ),
    };
  }

  @Get('exam-subjects/:id/roster')
  async roster(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getRoster(actor.personId, id) };
  }

  @Post('exam-subjects/:id/save')
  async save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveMarksDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.save(actor.personId, id, dto) };
  }

  @Post('exam-subjects/:id/publish')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.publish(actor.personId, id) };
  }

  // ===== Correction requests (real "sent back" loop from Marks verification) =====

  @Get('sent-back')
  async listSentBackSubmissions(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listSentBackSubmissions(actor.personId) };
  }

  @Post('exam-subjects/:id/correct')
  async correctMark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectMarkDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.correctMark(actor.personId, id, dto) };
  }
}
