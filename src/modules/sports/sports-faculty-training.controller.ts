// Feature #13 — training sessions + attendance.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { RecordTrainingAttendanceDto } from './dto/record-training-attendance.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { SportsFacultyTrainingService } from './sports-faculty-training.service';

@Roles('FACULTY')
@Controller('sports/training-sessions')
export class SportsFacultyTrainingController {
  constructor(private readonly service: SportsFacultyTrainingService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTrainingSessionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTrainingSessionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(actor, id, dto) };
  }

  @Get(':id/attendance')
  async listAttendance(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listAttendance(actor, id) };
  }

  @Post(':id/attendance')
  @HttpCode(HttpStatus.CREATED)
  async recordAttendance(
    @Param('id') id: string,
    @Body() dto: RecordTrainingAttendanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.recordAttendance(actor, id, dto) };
  }
}
