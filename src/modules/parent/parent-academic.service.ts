// Attendance, Report Card, Exams, Subjects, Current Term (+ Subject Detail),
// Timetable, Calendar -- one Parent-facing service over
// ParentAcademicRepository, every method guardian-checked first via the same
// GuardianLinkRepository every other Parent feature already uses.

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { CalendarRepository } from '../faculty/repositories/calendar.repository';
import { LMS_MATERIALS_BUCKET } from '../faculty/lms-storage.util';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentAcademicRepository } from './repositories/parent-academic.repository';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

@Injectable()
export class ParentAcademicService {
  constructor(
    private readonly academicRepo: ParentAcademicRepository,
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly attendanceRecordsService: AttendanceRecordsService,
    private readonly calendarRepo: CalendarRepository,
    private readonly storage: StorageService,
    private readonly announcementsService: AnnouncementsService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  private async requireSection(studentId: string) {
    const section = await this.academicRepo.getCurrentSection(studentId);
    if (!section) throw new NotFoundException('This student has no active enrolment this academic year.');
    return section;
  }

  // ---------- Attendance ----------

  async getAttendance(personId: string, studentId: string, month?: string) {
    await this.assertGuardian(personId, studentId);
    const summary = await this.attendanceRecordsService.getAttendanceSummaryForStudent(studentId);
    const now = new Date();
    const [year, mon] = (month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
    const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`;
    const monthEnd = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
    const days = await this.academicRepo.findMonthAttendance(studentId, monthStart, monthEnd);
    return { summary, days };
  }

  // ---------- Results (Report Card) ----------

  async listExamsForResults(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const section = await this.requireSection(studentId);
    return this.academicRepo.findPublishedExamsForSection(section.sectionId);
  }

  async getResults(personId: string, studentId: string, examId: string) {
    await this.assertGuardian(personId, studentId);
    const rows = await this.academicRepo.findResultsForStudent(studentId, examId);
    const scored = rows.filter((r) => r.marksObtained !== null);
    const totalObtained = Math.round(scored.reduce((sum, r) => sum + (r.marksObtained ?? 0), 0) * 100) / 100;
    const totalMax = scored.reduce((sum, r) => sum + r.maxMarks, 0);
    const percent = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : null;
    return { subjects: rows, totalObtained, totalMax, percent };
  }

  // ---------- Exams ----------

  async getExamSchedule(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    return this.academicRepo.findExamScheduleForStudent(studentId);
  }

  // ---------- Subjects + syllabus ----------

  async listSubjects(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const section = await this.requireSection(studentId);
    const offerings = await this.academicRepo.getCurrentOfferings(studentId);
    return Promise.all(
      offerings.map(async (o) => ({
        ...o,
        syllabusProgressPercent: await this.academicRepo.findSyllabusProgress(o.subjectId, section.gradeId, o.subjectOfferingId),
      })),
    );
  }

  // ---------- Current Term + Subject Detail ----------

  async listCurrentTerm(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    return this.academicRepo.getCurrentOfferings(studentId);
  }

  private async assertOwnsOffering(studentId: string, subjectOfferingId: string) {
    const offerings = await this.academicRepo.getCurrentOfferings(studentId);
    const offering = offerings.find((o) => o.subjectOfferingId === subjectOfferingId);
    if (!offering) throw new NotFoundException('Subject not found for this student.');
    return offering;
  }

  async getSubjectDetail(personId: string, studentId: string, subjectOfferingId: string) {
    await this.assertGuardian(personId, studentId);
    const offering = await this.assertOwnsOffering(studentId, subjectOfferingId);
    const [folders, lessonPlans] = await Promise.all([
      this.academicRepo.findSharedFolders(subjectOfferingId),
      this.academicRepo.findLessonPlans(subjectOfferingId),
    ]);
    return { offering, folders, lessonPlans };
  }

  async getFolderFiles(personId: string, studentId: string, subjectOfferingId: string, folderId: string) {
    await this.assertGuardian(personId, studentId);
    await this.assertOwnsOffering(studentId, subjectOfferingId);
    return this.academicRepo.findFolderFiles(folderId, subjectOfferingId);
  }

  async getFileUrl(personId: string, studentId: string, subjectOfferingId: string, fileId: string): Promise<string> {
    await this.assertGuardian(personId, studentId);
    await this.assertOwnsOffering(studentId, subjectOfferingId);
    const file = await this.academicRepo.findSharedFile(fileId, subjectOfferingId);
    if (!file) throw new NotFoundException('File not found');
    return this.storage.createSignedUrl(LMS_MATERIALS_BUCKET, file.objectKey, SIGNED_URL_TTL_SECONDS);
  }

  // ---------- Timetable ----------

  async getTimetable(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const section = await this.requireSection(studentId);
    return this.academicRepo.findTimetableForSection(section.sectionId, section.stage);
  }

  // ---------- Calendar ----------

  async getCalendar(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const section = await this.requireSection(studentId);
    return this.calendarRepo.findForStages([section.stage]);
  }

  // ---------- Announcements (Home feed + Notices) ----------

  async listAnnouncements(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const section = await this.requireSection(studentId);
    return this.announcementsService.listForParent([section.sectionId]);
  }

  // ---------- Profile ----------

  async getProfile(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const profile = await this.academicRepo.getProfile(studentId);
    if (!profile) throw new NotFoundException('Student not found.');
    return profile;
  }
}
