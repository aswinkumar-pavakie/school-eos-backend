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
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ParentFeedbackService } from './parent-feedback.service';

@Roles('PARENT')
@Controller('parent/students/:studentId/feedback')
export class ParentFeedbackController {
  constructor(private readonly service: ParentFeedbackService) {}

  @Get()
  async list(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.list(actor.personId, studentId) };
  }

  @Post()
  async submit(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: SubmitFeedbackDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.submit(actor.personId, studentId, dto) };
  }
}
