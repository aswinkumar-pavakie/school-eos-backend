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
import { CreateStudySessionDto } from './dto/create-study-session.dto';
import { MarkStudyAttendanceDto } from './dto/mark-study-attendance.dto';
import { StudySessionsService } from './study-sessions.service';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/study-sessions')
export class StudySessionsController {
  constructor(private readonly service: StudySessionsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Post()
  async create(
    @Body() dto: CreateStudySessionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Get(':id/attendance')
  async getRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getRoster(id, actor.personId) };
  }

  @Post(':id/attendance')
  async mark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkStudyAttendanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.mark(id, dto, actor.personId) };
  }
}
