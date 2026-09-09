import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { TimetableQueryDto } from './dto/timetable-query.dto';
import { TimetableService } from './timetable.service';

// Read-only view over a fully real, already-populated timetable_slot /
// timetable_period / subject_offering chain -- see query.md for how this was
// discovered (a prior assumption that "Timetable isn't built yet" was wrong; the
// schema and data already existed, just with no API in front of it). Broadened
// to include PRINCIPAL for read-only oversight (Principal's own Class Timetable
// module), and to VICE_PRINCIPAL (Phase 9 mobile Class Timetable module -- same
// oversight need) -- no method-level override needed anywhere in this
// controller, since every endpoint here is already GET-only for every role,
// Admin included -- there is no write endpoint on this controller at all, so
// this class-level broadening carries zero risk of granting write access.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get('periods')
  async listPeriods() {
    return { data: await this.timetableService.listPeriods() };
  }

  @Get()
  async get(@Query() query: TimetableQueryDto) {
    if (query.sectionId) {
      return { data: await this.timetableService.getForSection(query.sectionId) };
    }
    if (query.teacherStaffId) {
      return { data: await this.timetableService.getForTeacher(query.teacherStaffId) };
    }
    throw new BadRequestException('Provide either sectionId or teacherStaffId.');
  }
}
