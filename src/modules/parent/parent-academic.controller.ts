import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentAcademicService } from './parent-academic.service';

@Roles('PARENT')
@Controller('parent/students/:studentId')
export class ParentAcademicController {
  constructor(private readonly service: ParentAcademicService) {}

  @Get('timetable')
  async getTimetable(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getTimetable(actor.personId, studentId) };
  }

  @Get('calendar')
  async getCalendar(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getCalendar(actor.personId, studentId) };
  }

  @Get('announcements')
  async listAnnouncements(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listAnnouncements(actor.personId, studentId) };
  }

  @Get('profile')
  async getProfile(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getProfile(actor.personId, studentId) };
  }

  @Get('attendance')
  async getAttendance(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('month') month: string | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getAttendance(actor.personId, studentId, month) };
  }

  @Get('results/exams')
  async listExamsForResults(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listExamsForResults(actor.personId, studentId) };
  }

  @Get('results/exams/:examId')
  async getResults(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getResults(actor.personId, studentId, examId) };
  }

  @Get('exams')
  async getExamSchedule(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getExamSchedule(actor.personId, studentId) };
  }

  @Get('subjects')
  async listSubjects(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listSubjects(actor.personId, studentId) };
  }

  @Get('term')
  async listCurrentTerm(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listCurrentTerm(actor.personId, studentId) };
  }

  @Get('term/subjects/:subjectOfferingId')
  async getSubjectDetail(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getSubjectDetail(actor.personId, studentId, subjectOfferingId) };
  }

  @Get('term/subjects/:subjectOfferingId/folders/:folderId')
  async getFolderFiles(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getFolderFiles(actor.personId, studentId, subjectOfferingId, folderId) };
  }

  @Get('term/subjects/:subjectOfferingId/files/:fileId/url')
  async getFileUrl(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: { url: await this.service.getFileUrl(actor.personId, studentId, subjectOfferingId, fileId) } };
  }
}
