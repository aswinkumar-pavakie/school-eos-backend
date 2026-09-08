import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MarkNightAttendanceDto } from './dto/mark-night-attendance.dto';
import { NightAttendanceQueryDto } from './dto/night-attendance-query.dto';
import { NightAttendanceService } from './night-attendance.service';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/night-attendance')
export class NightAttendanceController {
  constructor(private readonly service: NightAttendanceService) {}

  @Get()
  async getRoster(
    @Query() query: NightAttendanceQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getRoster(actor.personId, query.date) };
  }

  @Post()
  async mark(
    @Body() dto: MarkNightAttendanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.mark(dto, actor.personId) };
  }
}
