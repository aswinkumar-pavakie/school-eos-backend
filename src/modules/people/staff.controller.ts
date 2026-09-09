import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { TimetableService } from '../timetable/timetable.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffExitDto } from './dto/staff-exit.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffService } from './staff.service';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's own /principal/faculty module) -- every write method below has
// its own narrower @Roles('ADMIN') override (RolesGuard's
// Reflector.getAllAndOverride means a method-level @Roles fully replaces, never
// merges with, the class-level one), so Principal never gains create/update/
// exit access even by calling the API directly.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly timetableService: TimetableService,
    private readonly staffAttendanceService: StaffAttendanceService,
  ) {}

  @Get()
  async list(@Query() query: StaffQueryDto) {
    const result = await this.staffService.list(query);
    return { data: result.data, meta: result.meta };
  }

  // Must come before ':id' -- otherwise "designations" would be parsed as an id.
  @Get('designations')
  async listDesignations(@Query('isTeaching') isTeaching?: string) {
    return this.staffService.listDesignations(isTeaching);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.staffService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStaffDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.staffService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.staffService.update(id, dto, actor.personId) };
  }

  @Get(':id/timetable')
  async listTimetable(@Param('id') id: string) {
    return { data: await this.timetableService.getForTeacher(id) };
  }

  @Get(':id/attendance-summary')
  async getAttendanceSummary(@Param('id') id: string) {
    return {
      data: await this.staffAttendanceService.getAttendanceSummaryForStaff(id),
    };
  }

  @Post(':id/exit')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async exit(
    @Param('id') id: string,
    @Body() dto: StaffExitDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.staffService.exit(id, dto, actor.personId) };
  }
}
