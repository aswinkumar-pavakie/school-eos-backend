import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AttendanceDiaryService, ReadMeta } from './attendance-diary.service';
import {
  DiaryContextQueryDto,
  EmployeeDiaryQueryDto,
  StudentDiaryQueryDto,
} from './dto/attendance-diary-query.dto';

// Attendance Diary. The @Roles list is only the front door: the service re-derives what THIS
// caller may actually see from role_assignment on every request (see the service header).
// Read-only by design -- there is no write endpoint in this module.
//
// Responses contain personal data about minors and staff: never cacheable by browsers or
// shared proxies.
@Roles(
  'ADMIN',
  'CORRESPONDENT',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'ACADEMIC_COORDINATOR',
  'CLASS_ADVISOR',
  'FACULTY',
)
@Controller('attendance-diary')
export class AttendanceDiaryController {
  constructor(private readonly service: AttendanceDiaryService) {}

  private meta(req: Request): ReadMeta {
    const ua = req.headers['user-agent'];
    return {
      ip: req.ip,
      userAgent: typeof ua === 'string' ? ua.slice(0, 255) : undefined,
    };
  }

  /** What this caller may see (tabs, class filter options) plus the default date (today, IST). */
  @Get('context')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  async context(
    @CurrentActor() actor: AuthenticatedUser,
    @Query() query: DiaryContextQueryDto,
  ) {
    return { data: await this.service.getContext(actor.personId, query) };
  }

  @Get('students')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  async students(
    @CurrentActor() actor: AuthenticatedUser,
    @Query() query: StudentDiaryQueryDto,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.listStudents(
        actor.personId,
        query,
        this.meta(req),
      ),
    };
  }

  /** Limited, attendance-only profile of one student (scope-checked; 404 outside your scope). */
  @Get('students/:studentId')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  async student(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: DiaryContextQueryDto,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.getStudentProfile(
        actor.personId,
        studentId,
        query.date,
        this.meta(req),
      ),
    };
  }

  @Get('employees')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  async employees(
    @CurrentActor() actor: AuthenticatedUser,
    @Query() query: EmployeeDiaryQueryDto,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.listEmployees(
        actor.personId,
        query,
        this.meta(req),
      ),
    };
  }
}
