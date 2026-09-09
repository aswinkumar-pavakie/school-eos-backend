// Academic Coordinator -- gated the exact same way every other role-specific
// Faculty feature is: @Roles('FACULTY') at the door (the base login role),
// then FacultyAcademicCoordinatorService re-derives real coordinator scope
// from role_assignment on every single call. A plain FACULTY caller with no
// coordinator grant gets a 403 from every route below, not a hidden tile.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AssignClassAdvisorDto } from './dto/assign-class-advisor.dto';
import { AssignOfferingTeacherDto } from './dto/assign-offering-teacher.dto';
import { CreateCoordinatorCalendarEventDto } from './dto/create-coordinator-calendar-event.dto';
import { CreateCoordinatorExamDto } from './dto/create-coordinator-exam.dto';
import { CreateExamSubjectDto } from './dto/create-exam-subject.dto';
import { UpdateCoordinatorCalendarEventDto } from './dto/update-coordinator-calendar-event.dto';
import { UpdateExamSubjectDto } from './dto/update-exam-subject.dto';
import { UpsertTimetableSlotDto } from './dto/upsert-timetable-slot.dto';
import { FacultyAcademicCoordinatorService } from './faculty-academic-coordinator.service';

@Roles('FACULTY')
@Controller('faculty/academic-coordinator')
export class FacultyAcademicCoordinatorController {
  constructor(private readonly service: FacultyAcademicCoordinatorService) {}

  @Get('me')
  async getMe(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getMe(actor.personId) };
  }

  @Get('dashboard')
  async getDashboard(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getDashboard(actor.personId) };
  }

  @Get('structure')
  async getStructure(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getStructure(actor.personId) };
  }

  @Get('sections')
  async getSections(
    @CurrentActor() actor: AuthenticatedUser,
    @Query('gradeId') gradeId?: string,
  ) {
    return { data: await this.service.getSections(actor.personId, gradeId) };
  }

  @Get('offerings')
  async getOfferings(
    @CurrentActor() actor: AuthenticatedUser,
    @Query('gradeId') gradeId?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return {
      data: await this.service.getOfferings(actor.personId, {
        gradeId,
        sectionId,
      }),
    };
  }

  @Patch('offerings/:id/teacher')
  async assignOfferingTeacher(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOfferingTeacherDto,
  ) {
    return {
      data: await this.service.assignOfferingTeacher(actor.personId, id, dto),
    };
  }

  @Get('eligible-faculty')
  async getEligibleFaculty(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getEligibleFaculty(actor.personId) };
  }

  @Get('faculty-workload')
  async getFacultyWorkload(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getFacultyWorkload(actor.personId) };
  }

  @Post('sections/:sectionId/advisor')
  async assignClassAdvisor(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: AssignClassAdvisorDto,
  ) {
    return {
      data: await this.service.assignClassAdvisor(
        actor.personId,
        sectionId,
        dto,
      ),
    };
  }

  @Delete('sections/:sectionId/advisor')
  @HttpCode(HttpStatus.OK)
  async revokeClassAdvisor(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    await this.service.revokeClassAdvisor(actor.personId, sectionId);
    return { data: { revoked: true } };
  }

  // ===== Class Timetable =====

  @Get('timetable/:sectionId')
  async getTimetable(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return { data: await this.service.getTimetable(actor.personId, sectionId) };
  }

  @Post('timetable/slots')
  async upsertTimetableSlot(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: UpsertTimetableSlotDto,
  ) {
    return {
      data: await this.service.upsertTimetableSlot(actor.personId, dto),
    };
  }

  @Delete('timetable/slots/:id')
  @HttpCode(HttpStatus.OK)
  async deleteTimetableSlot(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.deleteTimetableSlot(actor.personId, id);
    return { data: { deleted: true } };
  }

  @Post('timetable/:sectionId/publish')
  async publishTimetable(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return {
      data: await this.service.publishTimetable(actor.personId, sectionId),
    };
  }

  // ===== Examination =====

  @Get('exams')
  async listExams(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listExams(actor.personId) };
  }

  @Post('exams')
  async createExam(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: CreateCoordinatorExamDto,
  ) {
    return { data: await this.service.createExam(actor.personId, dto) };
  }

  @Post('exams/:id/advance')
  async advanceExamState(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.advanceExamState(actor.personId, id) };
  }

  @Get('exams/:id/subjects')
  async listExamSubjects(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.listExamSubjects(actor.personId, id) };
  }

  @Post('exams/:id/subjects')
  async createExamSubject(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExamSubjectDto,
  ) {
    return {
      data: await this.service.createExamSubject(actor.personId, id, dto),
    };
  }

  @Patch('exam-subjects/:id')
  async updateExamSubject(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamSubjectDto,
  ) {
    await this.service.updateExamSubject(actor.personId, id, dto);
    return { data: { updated: true } };
  }

  @Get('exams/:id/readiness')
  async getExamReadiness(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.getExamReadiness(actor.personId, id) };
  }

  // ===== Academic Calendar =====

  @Get('calendar')
  async listCalendarEvents(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listCalendarEvents(actor.personId) };
  }

  @Post('calendar')
  async createCalendarEvent(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: CreateCoordinatorCalendarEventDto,
  ) {
    return {
      data: await this.service.createCalendarEvent(actor.personId, dto),
    };
  }

  @Patch('calendar/:id')
  async updateCalendarEvent(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCoordinatorCalendarEventDto,
  ) {
    await this.service.updateCalendarEvent(actor.personId, id, dto);
    return { data: { updated: true } };
  }

  @Delete('calendar/:id')
  @HttpCode(HttpStatus.OK)
  async deleteCalendarEvent(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.deleteCalendarEvent(actor.personId, id);
    return { data: { deleted: true } };
  }
}
