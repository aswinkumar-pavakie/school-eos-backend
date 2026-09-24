import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ClassTeacherLoginService } from './class-teacher-login.service';
import {
  ListClassLoginsQueryDto,
  RolloverClassLoginsDto,
  SetClassLoginPasswordDto,
} from './dto/class-login-admin.dto';
import { CreateClassTeacherLoginDto } from './dto/create-class-teacher-login.dto';
import { ReassignClassTeacherDto } from './dto/reassign-class-teacher.dto';

// Admin-only. Design: school-eos-website/rnd-class-teacher-logins-admin.md.
@Roles('ADMIN')
@Controller('class-teacher-logins')
export class ClassTeacherLoginController {
  constructor(private readonly service: ClassTeacherLoginService) {}

  /** The seat table. Never returns a password. */
  @Get()
  async list(@Query() query: ListClassLoginsQueryDto) {
    return { data: await this.service.list(query) };
  }

  @Get('lookup')
  async lookup(
    @Query('gradeId') gradeId: string,
    @Query('sectionName') sectionName: string,
  ) {
    return { data: await this.service.findByGradeSection(gradeId, sectionName) };
  }

  // Rollover routes are declared before the ':loginPersonId' ones so a literal
  // path segment can never be read as an id.
  @Post('rollover/preview')
  @HttpCode(HttpStatus.OK)
  async rolloverPreview(@Body() dto: RolloverClassLoginsDto) {
    return {
      data: await this.service.rolloverPreview(dto.targetAcademicYearId, dto.overrides ?? []),
    };
  }

  @Post('rollover/apply')
  @HttpCode(HttpStatus.OK)
  async rolloverApply(
    @Body() dto: RolloverClassLoginsDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.rolloverApply(dto, actor.personId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateClassTeacherLoginDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Post(':loginPersonId/reassign')
  async reassign(
    @Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string,
    @Body() dto: ReassignClassTeacherDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.reassign(loginPersonId, dto, actor.personId) };
  }

  @Post(':loginPersonId/vacate')
  @HttpCode(HttpStatus.OK)
  async vacate(
    @Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.vacate(loginPersonId, actor.personId) };
  }

  @Post(':loginPersonId/password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string,
    @Body() dto: SetClassLoginPasswordDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.setPassword(loginPersonId, dto, actor.personId) };
  }

  /** POST, not GET: reading the password is an action, and it is audited. */
  @Post(':loginPersonId/reveal-password')
  @HttpCode(HttpStatus.OK)
  async revealPassword(
    @Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.revealPassword(loginPersonId, actor.personId) };
  }

  /** Cut every linked phone for this class (lost phone, suspected leak). */
  @Post(':loginPersonId/revoke-links')
  @HttpCode(HttpStatus.OK)
  async revokeLinks(
    @Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.revokeLinks(loginPersonId, actor.personId) };
  }

  @Get(':loginPersonId/students')
  async students(
    @Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string,
    @Query() query: ListClassLoginsQueryDto,
  ) {
    return { data: await this.service.students(loginPersonId, query.academicYearId) };
  }

  @Get(':loginPersonId/history')
  async history(@Param('loginPersonId', new ParseUUIDPipe()) loginPersonId: string) {
    return { data: await this.service.getHistory(loginPersonId) };
  }
}
