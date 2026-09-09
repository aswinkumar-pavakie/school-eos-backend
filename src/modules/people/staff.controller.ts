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
import { ApprovalsService } from '../approvals/approvals.service';
import { MyAttendanceQueryDto } from '../staff-attendance/dto/my-attendance-query.dto';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { TimetableService } from '../timetable/timetable.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { CreateStaffLeaveDto } from './dto/create-staff-leave.dto';
import { StaffExitDto } from './dto/staff-exit.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffLeaveService } from './staff-leave.service';
import { StaffService } from './staff.service';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's own /principal/faculty module) -- every write method below has
// its own narrower @Roles('ADMIN') override (RolesGuard's
// Reflector.getAllAndOverride means a method-level @Roles fully replaces, never
// merges with, the class-level one), so Principal never gains create/update/
// exit access even by calling the API directly.
//
// Vice Principal (Phase 6 mobile Faculty module) is granted access on FIVE
// specific read methods only (list/listDesignations/get/listTimetable/
// getAttendanceSummary), each with its own method-level override below --
// deliberately NOT a class-level change, same reasoning as students.controller.ts's
// own Phase 4 comment. create/update/exit stay untouched, ADMIN-only.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly timetableService: TimetableService,
    private readonly staffAttendanceService: StaffAttendanceService,
    private readonly staffLeaveService: StaffLeaveService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get()
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async list(@Query() query: StaffQueryDto) {
    const result = await this.staffService.list(query);
    return { data: result.data, meta: result.meta };
  }

  // Must come before ':id' -- otherwise "designations" would be parsed as an id.
  @Get('designations')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async listDesignations(@Query('isTeaching') isTeaching?: string) {
    return this.staffService.listDesignations(isTeaching);
  }

  // Must come before ':id' too, same reason. The real authorization here is
  // self-scoping (the caller's OWN staff record via their own personId,
  // never a client-supplied id -- there is no "other person's record" this
  // route can ever return), same idea as GET /auth/me, /approvals and
  // /notifications. A method-level @Roles() is still required despite that
  // -- this class carries its own class-level @Roles('ADMIN', 'PRINCIPAL')
  // default, and RolesGuard's Reflector.getAllAndOverride falls back to it
  // for any method with no override of its own, so omitting one here would
  // silently inherit ADMIN/PRINCIPAL-only rather than open up. Scoped to
  // exactly VICE_PRINCIPAL added, for its own mobile Profile screen (Phase
  // 25) -- not opened to every authenticated role, since no other role
  // currently needs it.
  @Get('me')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async getMine(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.staffService.getMine(actor.personId) };
  }

  // Same self-scoping as GET /staff/me above (staffId resolved from the
  // caller's own personId via staffService.getMine, never a client-supplied
  // id) -- this is the caller's OWN attendance history, never another
  // employee's. Vice Principal mobile My Attendance (Phase 27) is the first
  // consumer; reuses the existing staff_attendance_event data and the exact
  // same "latest event per day" dedup rule getAttendanceSummaryForStaff
  // already used, just also returning the day rows and a month-scoped count
  // alongside the existing lifetime one -- no new table, no new write path.
  @Get('me/attendance-history')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async getMyAttendanceHistory(@Query() query: MyAttendanceQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    const staff = await this.staffService.getMine(actor.personId);
    return { data: await this.staffAttendanceService.getMyAttendanceHistory(staff.id, query.month) };
  }

  // Own leave requests only -- staffId resolved server-side the same way as
  // every other /staff/me* route above; restores the real, already-
  // configured STAFF_LEAVE_REQUEST approval_policy + the already-live
  // staff_leave_request table's missing application layer (see
  // staff-leave-approval-handlers.service.ts's own comment) rather than
  // inventing a new leave engine. Vice Principal mobile My Leave (Phase 28)
  // is the first consumer.
  @Get('me/leave-requests')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async listMyLeaveRequests(@CurrentActor() actor: AuthenticatedUser) {
    const staff = await this.staffService.getMine(actor.personId);
    return { data: await this.staffLeaveService.list(staff.id) };
  }

  @Get('me/leave-requests/:id')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async getMyLeaveRequest(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const staff = await this.staffService.getMine(actor.personId);
    const leave = await this.staffLeaveService.get(id, staff.id);
    const trail = leave.approvalRequestId ? await this.staffLeaveService.getApprovalTrail(leave.approvalRequestId, actor) : null;
    return { data: { ...leave, approvalSteps: trail?.steps ?? [] } };
  }

  @Post('me/leave-requests')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  @HttpCode(HttpStatus.CREATED)
  async createMyLeaveRequest(@Body() dto: CreateStaffLeaveDto, @CurrentActor() actor: AuthenticatedUser) {
    const staff = await this.staffService.getMine(actor.personId);
    return { data: await this.staffLeaveService.create(staff.id, dto, actor) };
  }

  // Withdraw reuses the generic engine's own POST /approvals/:id/withdraw
  // unchanged (requester-only, still-open-only, already enforced there) --
  // this route only exists to verify the leave row itself is the caller's
  // own before revealing/using its approvalRequestId, then delegates
  // entirely to that existing, unmodified method.
  @Post('me/leave-requests/:id/withdraw')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  @HttpCode(HttpStatus.OK)
  async withdrawMyLeaveRequest(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const staff = await this.staffService.getMine(actor.personId);
    const leave = await this.staffLeaveService.assertOwnLeave(id, staff.id);
    return { data: await this.approvalsService.withdraw(leave.approvalRequestId as string, actor) };
  }

  @Get(':id')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
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
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async listTimetable(@Param('id') id: string) {
    return { data: await this.timetableService.getForTeacher(id) };
  }

  @Get(':id/attendance-summary')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
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
