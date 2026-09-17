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

  // School-wide, not warden-scoped -- backs the Principal/Vice Principal web console's real
  // Hostel roll-call oversight (design-reframe addition). A distinct route,
  // not a personId branch on getRoster() above, since a Principal is never an
  // "active warden" and requireActiveWarden() would legitimately deny them.
  @Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL')
  @Get('oversight')
  async getRosterSchoolWide(@Query() query: NightAttendanceQueryDto) {
    return { data: await this.service.getRosterSchoolWide(query.date) };
  }

  @Post()
  async mark(
    @Body() dto: MarkNightAttendanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.mark(dto, actor.personId) };
  }
}
