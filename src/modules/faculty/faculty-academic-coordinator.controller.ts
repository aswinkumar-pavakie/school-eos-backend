// Academic Coordinator -- gated to accept either the base FACULTY login role
// (a faculty member who also holds a coordinator grant, using their one
// shared login) OR ACADEMIC_COORDINATOR directly (a genuinely separate
// coordinator-only login created via Admin's own "coordinator login" flow --
// see persons.service.ts's createAcademicCoordinatorLogin -- which carries
// no FACULTY role at all). Either way, FacultyAcademicCoordinatorService
// re-derives real coordinator scope from role_assignment on every single
// call, keyed by whichever person is actually calling; nothing here trusts
// the JWT's roles for anything beyond this door check. A plain FACULTY
// caller with no coordinator grant, or an ACADEMIC_COORDINATOR caller
// somehow missing its own role_assignment row, gets a 403/empty result from
// the service itself, not a hidden tile.

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
import { CreateAnnouncementDto } from '../announcements/dto/create-announcement.dto';
import { UpdateAnnouncementDto } from '../announcements/dto/update-announcement.dto';
import { AssignClassAdvisorDto } from './dto/assign-class-advisor.dto';
import { AssignOfferingTeacherDto } from './dto/assign-offering-teacher.dto';
import { CreateCoordinatorCalendarEventDto } from './dto/create-coordinator-calendar-event.dto';
import { CreateCoordinatorExamDto } from './dto/create-coordinator-exam.dto';
import { CreateExamSubjectDto } from './dto/create-exam-subject.dto';
import { MarkAttendanceRecordDto } from './dto/mark-attendance-record.dto';
import { AssignSubstitutionDto } from './dto/assign-substitution.dto';
import { SendBackMarksSubmissionDto } from './dto/send-back-marks-submission.dto';
import { SetMarksEntryWindowDto } from './dto/set-marks-entry-window.dto';
import { UpdateCoordinatorCalendarEventDto } from './dto/update-coordinator-calendar-event.dto';
import { UpdateExamSubjectDto } from './dto/update-exam-subject.dto';
import { UpsertTimetableSlotDto } from './dto/upsert-timetable-slot.dto';
import { FacultyAcademicCoordinatorService } from './faculty-academic-coordinator.service';

@Roles('FACULTY', 'ACADEMIC_COORDINATOR')
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

  @Get('notices')
  async listNotices(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listNotices(actor.personId) };
  }

  @Get('attendance')
  async listAttendance(
    @Query('date') date: string | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const effectiveDate = date ?? new Date().toISOString().slice(0, 10);
    return { data: await this.service.listAttendance(actor.personId, effectiveDate) };
  }

  @Get('attendance/sections/:sectionId/roster')
  async getAttendanceRoster(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query('date') date: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getAttendanceRoster(
        actor.personId,
        sectionId,
        date,
      ),
    };
  }

  @Patch('attendance/sections/:sectionId/records/:recordId')
  async markAttendanceRecord(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: MarkAttendanceRecordDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.markAttendanceRecord(
        actor.personId,
        sectionId,
        recordId,
        dto,
      ),
    };
  }

  @Post('attendance/sections/:sectionId/mark-all-present')
  async markAllPresentForSection(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query('date') date: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.markAllPresentForSection(
        actor.personId,
        sectionId,
        date,
      ),
    };
  }

  @Post('attendance/sections/:sectionId/publish')
  async publishAttendance(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query('date') date: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.publishAttendance(
        actor.personId,
        sectionId,
        date,
      ),
    };
  }

  @Get('performance/sections/:sectionId/exams')
  async listPerformanceExams(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.listPerformanceExams(actor.personId, sectionId),
    };
  }

  @Get('performance/sections/:sectionId/exams/:examId')
  async getPerformance(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getPerformance(actor.personId, sectionId, examId),
    };
  }

  // ===== Marks verification =====

  @Get('marks-submissions')
  async listMarksSubmissions(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMarksSubmissions(actor.personId) };
  }

  @Get('marks-submissions/sections/:sectionId/exams/:examId')
  async getMarksSubmissionDetail(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getMarksSubmissionDetail(
        actor.personId,
        sectionId,
        examId,
      ),
    };
  }

  @Post('marks-submissions/sections/:sectionId/exams/:examId/verify')
  async verifyMarksSubmission(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.verifyMarksSubmission(
        actor.personId,
        sectionId,
        examId,
      ),
    };
  }

  @Post('marks-submissions/sections/:sectionId/exams/:examId/send-back')
  async sendBackMarksSubmission(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: SendBackMarksSubmissionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.sendBackMarksSubmission(
        actor.personId,
        sectionId,
        examId,
        dto,
      ),
    };
  }

  @Get('students')
  async listStudents(
    @Query('search') search: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return this.service.listStudents(actor.personId, {
      search,
      sectionId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('students/:studentId')
  async getStudentDetail(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getStudentDetail(actor.personId, studentId),
    };
  }

  @Post('notices')
  @HttpCode(HttpStatus.CREATED)
  async createNotice(
    @Body() dto: CreateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createNotice(actor.personId, dto) };
  }

  @Patch('notices/:id')
  async updateNotice(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateNotice(actor.personId, id, dto) };
  }

  @Delete('notices/:id')
  @HttpCode(HttpStatus.OK)
  async deleteNotice(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteNotice(actor.personId, id);
    return { data: { deleted: true } };
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

  @Patch('exams/:id/marks-window')
  async setMarksEntryWindow(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMarksEntryWindowDto,
  ) {
    return {
      data: await this.service.setMarksEntryWindow(actor.personId, id, dto),
    };
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

  // ===== Syllabus tracking =====

  @Get('syllabus')
  async listSyllabusCoverage(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listSyllabusCoverage(actor.personId) };
  }

  // ===== Academic approvals =====

  @Get('approvals')
  async listAcademicApprovals(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listAcademicApprovals(actor.personId) };
  }

  // ===== Reports =====

  @Get('reports')
  async getReports(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getReports(actor.personId) };
  }

  // ===== Substitute teacher =====

  @Get('substitute-gaps')
  async listSubstituteGaps(
    @Query('date') date: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listSubstituteGaps(actor.personId, date) };
  }

  @Post('substitutions')
  @HttpCode(HttpStatus.CREATED)
  async assignSubstitution(
    @Body() dto: AssignSubstitutionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.assignSubstitution(actor.personId, dto) };
  }
}
