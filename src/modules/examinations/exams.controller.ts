import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ListExamsQueryDto } from './dto/list-exams.query.dto';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';

// Admin-only end to end. The API doc calls this "Academic authority" (which it
// resolves to Admin/Principal/Vice Principal), and Academic Coordinator is a
// Faculty assignment with no web login at all (doc: "No Faculty account --
// regardless of assignment, including Academic Coordinator -- can authenticate
// against a web-tagged endpoint; Faculty is mobile-only"). This build is scoped
// to Admin only, by explicit instruction -- Principal's own Examination
// Timetable / Examinations pages stay their existing ComingSoon stubs and are
// not wired to this module. `exam` + `exam_subject` are real, already-populated
// tables (2 / 672 rows) -- this is an API layer in front of existing schema,
// not a new one; no CREATE TABLE was written for this.
@Roles('ADMIN')
@Controller()
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get('examinations')
  async list(@Query() query: ListExamsQueryDto) {
    return { data: await this.examsService.list(query) };
  }

  @Get('examinations/:id')
  async get(@Param('id') id: string) {
    return { data: await this.examsService.get(id) };
  }

  @Post('examinations')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExamDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.examsService.create(dto, actor.personId) };
  }

  @Patch('examinations/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.examsService.update(id, dto, actor.personId) };
  }

  @Get('examinations/:id/schedules')
  async listSchedules(@Param('id') id: string) {
    return { data: await this.examsService.listSchedules(id) };
  }

  @Post('examinations/:id/schedules')
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @Param('id') id: string,
    @Body() dto: CreateExamScheduleDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.examsService.createSchedule(id, dto, actor.personId) };
  }

  @Patch('examination-schedules/:id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateExamScheduleDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.examsService.updateSchedule(id, dto, actor.personId) };
  }

  @Post('examinations/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.examsService.publish(id, actor.personId) };
  }

  @Post('examinations/:id/lock')
  @HttpCode(HttpStatus.OK)
  async lock(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.examsService.lock(id, actor.personId) };
  }
}
