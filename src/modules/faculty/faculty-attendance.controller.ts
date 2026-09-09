import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AttendanceDayQueryDto } from './dto/attendance-day-query.dto';
import { MarkAttendanceRecordDto } from './dto/mark-attendance-record.dto';
import { FacultyAttendanceService } from './faculty-attendance.service';

@Roles('FACULTY')
@Controller('faculty/attendance')
export class FacultyAttendanceController {
  constructor(private readonly service: FacultyAttendanceService) {}

  @Get()
  async getRoster(@Query() query: AttendanceDayQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getOrCreateRoster(actor.personId, query.sectionId, query.date) };
  }

  @Post('mark-all-present')
  async markAllPresent(@Query() query: AttendanceDayQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.markAllPresent(actor.personId, query.sectionId, query.date) };
  }

  @Post('records/:id')
  async markRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: MarkAttendanceRecordDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.markRecord(actor.personId, sectionId, id, dto) };
  }

  @Get('history')
  async history(
    @Query('sectionId', ParseUUIDPipe) sectionId: string,
    @Query('monthStart') monthStart: string,
    @Query('monthEnd') monthEnd: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getHistory(actor.personId, sectionId, monthStart, monthEnd) };
  }
}
