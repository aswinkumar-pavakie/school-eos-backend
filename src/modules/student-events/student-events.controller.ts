import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { StaffQueryDto } from '../people/dto/staff-query.dto';
import { StudentQueryDto } from '../people/dto/student-query.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { CreateStudentEventDto } from './dto/create-student-event.dto';
import { StudentEventsService } from './student-events.service';

// Faculty's own "Events" feature: create an event, search/add/remove students,
// delete an event. Every :id route is scoped to events THIS faculty member
// created (see StudentEventsService.getOwned) -- no faculty can see or touch
// another faculty member's event.
@Roles('FACULTY')
@Controller('faculty/events')
export class StudentEventsController {
  constructor(private readonly service: StudentEventsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Get('students-search')
  async searchStudents(@Query() query: StudentQueryDto) {
    const result = await this.service.searchStudents(query);
    return { data: result.data, meta: result.meta };
  }

  @Get('teachers-search')
  async searchTeachers(@Query() query: StaffQueryDto) {
    const result = await this.service.searchTeachers(query);
    return { data: result.data, meta: result.meta };
  }

  @Get('grades')
  async listGrades() {
    return { data: await this.service.listGrades() };
  }

  @Get('sections')
  async listSections(@Query('gradeId') gradeId?: string) {
    return { data: await this.service.listSections(gradeId) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.get(id, actor.personId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStudentEventDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.delete(id, actor.personId);
    return { data: { deleted: true } };
  }

  @Post(':id/students')
  @HttpCode(HttpStatus.CREATED)
  async addStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.addParticipant(id, dto, actor.personId) };
  }

  @Delete(':id/students/:participantId')
  @HttpCode(HttpStatus.OK)
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.removeParticipant(id, participantId, actor.personId);
    return { data: { deleted: true } };
  }

  @Get(':id/students/:participantId/permission-letter')
  async getPermissionLetter(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getPermissionLetter(id, participantId, actor.personId) };
  }
}
