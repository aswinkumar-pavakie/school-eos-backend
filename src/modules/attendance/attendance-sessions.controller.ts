import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AttendanceSessionsService } from './attendance-sessions.service';
import { AttendanceSessionQueryDto } from './dto/attendance-session-query.dto';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';

@Roles('ADMIN')
@Controller('attendance-sessions')
export class AttendanceSessionsController {
  constructor(private readonly sessionsService: AttendanceSessionsService) {}

  @Get()
  async list(@Query() query: AttendanceSessionQueryDto) {
    const result = await this.sessionsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.sessionsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAttendanceSessionDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.sessionsService.create(dto, actor.personId) };
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  async lock(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.sessionsService.lock(id, actor.personId) };
  }
}
