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
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FreezeWalletDto } from '../finance/dto/freeze-wallet.dto';
import { StudentFeesService } from '../finance/student-fees.service';
import { StudentWalletService } from '../finance/student-wallet.service';
import { StudentTransportAllocationsService } from '../transport/student-transport-allocations.service';
import { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import { CreateGuardianLinkDto } from './dto/create-guardian-link.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentLeaveDto } from './dto/student-leave.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { EnrolmentsService } from './enrolments.service';
import { GuardianLinksService } from './guardian-links.service';
import { StudentsService } from './students.service';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's own /principal/students module) -- every write method below has
// its own narrower @Roles('ADMIN') override (RolesGuard's
// Reflector.getAllAndOverride means a method-level @Roles fully replaces, never
// merges with, the class-level one), so Principal never gains create/update/
// leave/enrolment/wallet-freeze/guardian-grant access even by calling the API
// directly.
//
// Vice Principal (Phase 4 mobile Students module) is granted access on FOUR
// specific read methods only (list/get/getAttendanceSummary/listGuardians),
// each with its own method-level override below -- deliberately NOT a
// class-level change. listTransport/listFees/getWallet stay PRINCIPAL+ADMIN
// only: those are Finance/Operations concerns, explicitly out of this
// phase's scope ("no unrestricted financial information exposed merely
// because a Finance API exists"). listEnrolments/createEnrolment also stay
// untouched -- the Vice Principal mobile detail screen reads current
// grade/section straight off the student row itself, no enrolment history
// needed for a leadership overview.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly enrolmentsService: EnrolmentsService,
    private readonly guardianLinksService: GuardianLinksService,
    private readonly transportAllocationsService: StudentTransportAllocationsService,
    private readonly studentFeesService: StudentFeesService,
    private readonly studentWalletService: StudentWalletService,
    private readonly attendanceRecordsService: AttendanceRecordsService,
  ) {}

  @Get()
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async list(@Query() query: StudentQueryDto) {
    const result = await this.studentsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async get(@Param('id') id: string) {
    return { data: await this.studentsService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStudentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.studentsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.studentsService.update(id, dto, actor.personId) };
  }

  @Post(':id/leave')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async leave(
    @Param('id') id: string,
    @Body() dto: StudentLeaveDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.studentsService.leave(id, dto, actor.personId) };
  }

  @Get(':id/enrolments')
  async listEnrolments(@Param('id') id: string) {
    return { data: await this.enrolmentsService.listByStudent(id) };
  }

  @Post(':id/enrolments')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createEnrolment(
    @Param('id') id: string,
    @Body() dto: CreateEnrolmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.enrolmentsService.create(id, dto, actor.personId),
    };
  }

  @Get(':id/transport')
  async listTransport(@Param('id') id: string) {
    return {
      data: await this.transportAllocationsService.getSummaryForStudent(id),
    };
  }

  @Get(':id/fees')
  async listFees(@Param('id') id: string) {
    return { data: await this.studentFeesService.getSummaryForStudent(id) };
  }

  @Get(':id/wallet')
  async getWallet(@Param('id') id: string) {
    return { data: await this.studentWalletService.getForStudent(id) };
  }

  @Post(':id/wallet/freeze')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async freezeWallet(
    @Param('id') id: string,
    @Body() dto: FreezeWalletDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.studentWalletService.freeze(
        id,
        dto.reason,
        actor.personId,
      ),
    };
  }

  @Post(':id/wallet/unfreeze')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async unfreezeWallet(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.studentWalletService.unfreeze(id, actor.personId),
    };
  }

  @Get(':id/attendance-summary')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async getAttendanceSummary(@Param('id') id: string) {
    return {
      data: await this.attendanceRecordsService.getAttendanceSummaryForStudent(
        id,
      ),
    };
  }

  @Get(':id/guardians')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async listGuardians(@Param('id') id: string) {
    return { data: await this.guardianLinksService.listByStudent(id) };
  }

  @Post(':id/guardians')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createGuardian(
    @Param('id') id: string,
    @Body() dto: CreateGuardianLinkDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.guardianLinksService.create(id, dto, actor.personId),
    };
  }
}
