import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MarkStaffAttendanceDto } from './dto/mark-staff-attendance.dto';
import { StaffAttendanceQueryDto } from './dto/staff-attendance-query.dto';
import { StaffAttendanceService } from './staff-attendance.service';

// Bulk staff/teacher attendance marking -- built against the real
// staff_attendance_event table (previously biometric-device-only; see query.md
// for the ABSENT event_type widening this needed).
@Roles('ADMIN')
@Controller('staff-attendance')
export class StaffAttendanceController {
  constructor(private readonly staffAttendanceService: StaffAttendanceService) {}

  @Get()
  async getRoster(@Query() query: StaffAttendanceQueryDto) {
    return { data: await this.staffAttendanceService.getDailyRoster(query) };
  }

  @Post('mark')
  @HttpCode(HttpStatus.OK)
  async markBulk(@Body() dto: MarkStaffAttendanceDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.staffAttendanceService.markBulk(dto, actor.personId) };
  }
}
