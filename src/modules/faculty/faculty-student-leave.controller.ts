import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateStudentLeaveRequestDto } from './dto/create-student-leave-request.dto';
import { FacultyStudentLeaveService } from './faculty-student-leave.service';

// Deciding a request happens through the existing generic
// POST /approvals/:id/approve|reject endpoints (this controller's own
// approvalRequestId on each row is what that call needs) -- not duplicated
// here.
@Roles('FACULTY')
@Controller('faculty/student-leave')
export class FacultyStudentLeaveController {
  constructor(private readonly service: FacultyStudentLeaveService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listForAdvisor(actor.personId) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.get(actor.personId, id) };
  }
}

// The minimal Parent-side creation path (see FacultyStudentLeaveService's own
// note on why this exists at all) lives under /parent -- a real Parent login,
// not Faculty -- kept in this same file since it's one small, tightly-scoped
// endpoint rather than a whole separate module for a feature that is
// explicitly out of scope to build out fully this round.
@Roles('PARENT')
@Controller('parent/student-leave-requests')
export class ParentStudentLeaveController {
  constructor(private readonly service: FacultyStudentLeaveService) {}

  @Get()
  async list(@Query('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listForStudent(actor.personId, studentId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStudentLeaveRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, dto) };
  }
}
