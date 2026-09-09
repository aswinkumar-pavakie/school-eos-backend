import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AttendanceSessionsService } from './attendance-sessions.service';
import { AttendanceSessionQueryDto } from './dto/attendance-session-query.dto';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';

// Class-level stays ADMIN-only -- unlike students/staff/parents, PRINCIPAL was
// never broadened onto this controller either, so Vice Principal (Phase 7
// mobile Attendance module) gets its own explicit method-level grant here
// rather than following a PRINCIPAL precedent that doesn't exist. Read-only:
// list/get only -- create/lock stay ADMIN-only, no write access implied by
// the mobile Attendance module being read/oversight-only.
@Roles('ADMIN')
@Controller('attendance-sessions')
export class AttendanceSessionsController {
  constructor(private readonly sessionsService: AttendanceSessionsService) {}

  @Get()
  @Roles('ADMIN', 'VICE_PRINCIPAL')
  async list(@Query() query: AttendanceSessionQueryDto) {
    const result = await this.sessionsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  @Roles('ADMIN', 'VICE_PRINCIPAL')
  async get(@Param('id') id: string) {
    return { data: await this.sessionsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAttendanceSessionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sessionsService.create(dto, actor.personId) };
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  async lock(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sessionsService.lock(id, actor.personId) };
  }
}
