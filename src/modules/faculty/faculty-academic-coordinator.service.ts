// Academic Coordinator -- a real, already-existing role (role_code =
// 'ACADEMIC_COORDINATOR' in the `role` table, granted via Admin's own
// existing POST /role-assignments exactly like CLASS_ADVISOR) that this
// module now lets a Faculty-app caller actually *use*. Every method here
// re-derives the caller's real scope from role_assignment on every request
// (never from the JWT, never cached) -- so a scope change Admin makes takes
// effect immediately, and a person with no active grant is refused outright,
// not just hidden in the UI.
//
// Deliberately NOT built here (see the module's own scope boundary): the
// Admin-side "create/revoke a coordinator assignment" screen (that's Admin's
// module, already has its own endpoint this never touches), Principal's own
// timetable/exam approval step (no Principal app exists yet to approve
// anything -- the state machine is real and ready for it, but a Coordinator
// publishes within their own authorized scope today), curriculum/syllabus
// draft-publish, and promotion/progression (no existing computation
// infrastructure to build on safely).

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { CreateAnnouncementDto } from '../announcements/dto/create-announcement.dto';
import { UpdateAnnouncementDto } from '../announcements/dto/update-announcement.dto';
import { MarkAttendanceRecordDto } from './dto/mark-attendance-record.dto';
import { StudentRepository } from '../people/repositories/student.repository';
import { StudentsService } from '../people/students.service';
import { GuardianLinksService } from '../people/guardian-links.service';
import { StudentFeesService } from '../finance/student-fees.service';
import { AttendanceSessionRepository } from '../attendance/repositories/attendance-session.repository';
import { AttendanceRecordRepository } from '../attendance/repositories/attendance-record.repository';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { FacultyClassResultsService } from './faculty-class-results.service';
import { AssignClassAdvisorDto } from './dto/assign-class-advisor.dto';
import { AssignOfferingTeacherDto } from './dto/assign-offering-teacher.dto';
import { CreateCoordinatorCalendarEventDto } from './dto/create-coordinator-calendar-event.dto';
import { CreateCoordinatorExamDto } from './dto/create-coordinator-exam.dto';
import { CreateExamSubjectDto } from './dto/create-exam-subject.dto';
import { UpdateCoordinatorCalendarEventDto } from './dto/update-coordinator-calendar-event.dto';
import { UpdateExamSubjectDto } from './dto/update-exam-subject.dto';
import { UpsertTimetableSlotDto } from './dto/upsert-timetable-slot.dto';
import { AcademicCoordinatorRepository } from './repositories/academic-coordinator.repository';
import { AcademicCoordinatorExamRepository } from './repositories/academic-coordinator-exam.repository';
import { AcademicCoordinatorTimetableRepository } from './repositories/academic-coordinator-timetable.repository';
import { CalendarRepository } from './repositories/calendar.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { ExamVerificationRepository } from './repositories/exam-verification.repository';
import { SendBackMarksSubmissionDto } from './dto/send-back-marks-submission.dto';
import { SetMarksEntryWindowDto } from './dto/set-marks-entry-window.dto';
import { AcademicCoordinatorSyllabusRepository } from './repositories/academic-coordinator-syllabus.repository';
import { SubstitutionRepository } from './repositories/substitution.repository';
import { StaffLeaveRequestRepository } from './repositories/staff-leave-request.repository';
import { TimetableService } from '../timetable/timetable.service';
import { ClassTeacherLoginService } from '../admin/class-teacher-login.service';
import { AssignSubstitutionDto } from './dto/assign-substitution.dto';

interface ResolvedScope {
  gradeIds: string[];
  stages: string[];
}

@Injectable()
export class FacultyAcademicCoordinatorService {
  constructor(
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly acRepo: AcademicCoordinatorRepository,
    private readonly ttRepo: AcademicCoordinatorTimetableRepository,
    private readonly examRepo: AcademicCoordinatorExamRepository,
    private readonly calendarRepo: CalendarRepository,
    private readonly audit: AuditService,
    private readonly announcementsService: AnnouncementsService,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceSessionRepo: AttendanceSessionRepository,
    private readonly attendanceRecordRepo: AttendanceRecordRepository,
    private readonly classResultsService: FacultyClassResultsService,
    private readonly examVerificationRepo: ExamVerificationRepository,
    private readonly syllabusRepo: AcademicCoordinatorSyllabusRepository,
    private readonly studentsService: StudentsService,
    private readonly guardianLinksService: GuardianLinksService,
    private readonly studentFeesService: StudentFeesService,
    private readonly attendanceRecordsService: AttendanceRecordsService,
    private readonly substitutionRepo: SubstitutionRepository,
    private readonly staffLeaveRequestRepo: StaffLeaveRequestRepository,
    private readonly timetableService: TimetableService,
    private readonly unitOfWork: UnitOfWork,
    private readonly classTeacherLogins: ClassTeacherLoginService,
  ) {}

  // ============================================================
  // Scope resolution -- the one gate every method below runs through first.
  // ============================================================

  private async resolveScope(personId: string): Promise<ResolvedScope> {
    const raw = await this.scopeRepo.getCoordinatorScope(personId);
    if (raw.length === 0) {
      throw new ForbiddenException(
        'You are not currently assigned as an Academic Coordinator.',
      );
    }
    const stages = [
      ...new Set(
        raw
          .filter((r) => r.scopeType === 'STAGE')
          .map((r) => r.scopeStage as string),
      ),
    ];
    const explicitGradeIds = raw
      .filter((r) => r.scopeType === 'GRADE')
      .map((r) => r.scopeId as string);
    const schoolWide = raw.some((r) => r.scopeType === 'SCHOOL');
    const gradeIds = await this.acRepo.resolveGradeIdsForScope(
      stages,
      explicitGradeIds,
      schoolWide,
    );
    const grades = await this.acRepo.findGrades(gradeIds);
    const effectiveStages = [
      ...new Set([...stages, ...grades.map((g) => g.stage)]),
    ];
    return { gradeIds, stages: effectiveStages };
  }

  private assertGradeInScope(scope: ResolvedScope, gradeId: string) {
    if (!scope.gradeIds.includes(gradeId)) {
      throw new ForbiddenException(
        'That grade is outside your assigned academic scope.',
      );
    }
  }

  /** Same check, but doesn't throw -- lets `me` report coordinator status
   * without failing the request for a non-coordinator caller. */
  async isCoordinator(personId: string): Promise<boolean> {
    const raw = await this.scopeRepo.getCoordinatorScope(personId);
    return raw.length > 0;
  }

  async getMe(personId: string) {
    const raw = await this.scopeRepo.getCoordinatorScope(personId);
    if (raw.length === 0)
      return { isCoordinator: false, stages: [], grades: [] };
    const scope = await this.resolveScope(personId);
    const grades = await this.acRepo.findGrades(scope.gradeIds);
    return { isCoordinator: true, stages: scope.stages, grades };
  }

  // ============================================================
  // Dashboard + academic structure (sections 3, 6, 8)
  // ============================================================

  async getDashboard(personId: string) {
    const scope = await this.resolveScope(personId);
    const [grades, sections, offerings, workload] = await Promise.all([
      this.acRepo.findGrades(scope.gradeIds),
      this.acRepo.findSections(scope.gradeIds),
      this.acRepo.findOfferings(scope.gradeIds, {}),
      this.acRepo.findFacultyWorkload(scope.gradeIds),
    ]);
    const totalStudents = grades.reduce((sum, g) => sum + g.studentCount, 0);
    const unassignedOfferings = offerings.filter(
      (o) => !o.teacherStaffId,
    ).length;
    const sectionsWithoutAdvisor = sections.filter(
      (s) => !s.advisorRoleAssignmentId,
    ).length;
    return {
      stages: scope.stages,
      gradeCount: grades.length,
      sectionCount: sections.length,
      studentCount: totalStudents,
      subjectOfferingCount: offerings.length,
      facultyCount: workload.length,
      unassignedOfferings,
      sectionsWithoutAdvisor,
    };
  }

  async getStructure(personId: string) {
    const scope = await this.resolveScope(personId);
    const [grades, sections] = await Promise.all([
      this.acRepo.findGrades(scope.gradeIds),
      this.acRepo.findSections(scope.gradeIds),
    ]);
    return { grades, sections };
  }

  async getSections(personId: string, gradeId?: string) {
    const scope = await this.resolveScope(personId);
    if (gradeId) this.assertGradeInScope(scope, gradeId);
    const sections = await this.acRepo.findSections(
      gradeId ? [gradeId] : scope.gradeIds,
    );
    return sections;
  }

  // ============================================================
  // Notices -- same real AnnouncementsService the Admin/Principal panel and
  // Faculty's own scoped Announcements screen use, never a second copy.
  // Reuses the exact "resolve my own real sections, restrict SECTION targets
  // to those" ownership pattern FacultyAnnouncementsController already
  // established -- a coordinator can never target a section outside their
  // own assigned stage/grades, and never SCHOOL/ROLE audiences beyond the
  // real ACADEMIC_COORDINATOR role code itself.
  // ============================================================

  async listNotices(personId: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const sectionIds = sections.map((s) => s.sectionId);
    const rows = await this.announcementsService.listForCoordinator(sectionIds);
    return rows.map((r) => ({ ...r, canEdit: r.createdBy === personId }));
  }

  async createNotice(personId: string, dto: CreateAnnouncementDto) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const ownSectionIds = new Set(sections.map((s) => s.sectionId));

    if (dto.audienceType === 'SECTION') {
      const notMine = (dto.targetSectionIds ?? []).filter(
        (id) => !ownSectionIds.has(id),
      );
      if (notMine.length > 0) {
        throw new ForbiddenException(
          'You can only target sections within your own academic scope.',
        );
      }
    } else if (dto.audienceType !== 'ROLE' || !dto.targetRoles?.every((r) => r === 'ACADEMIC_COORDINATOR')) {
      throw new ForbiddenException(
        'A coordinator notice must target your own sections, or every Academic Coordinator.',
      );
    }

    return this.announcementsService.create(dto, personId);
  }

  /** Same audience/scope validation as createNotice -- only re-run when the
   * caller is actually changing the audience; a title/body-only edit skips
   * it (nothing about scope changed). Ownership itself (only your own
   * notice) is enforced by AnnouncementsService.update's own
   * restrictToOwnerId, the exact same real mechanism Faculty's own
   * announcements CRUD already uses. */
  async updateNotice(personId: string, id: string, dto: UpdateAnnouncementDto) {
    if (dto.audienceType) {
      const scope = await this.resolveScope(personId);
      const sections = await this.acRepo.findSections(scope.gradeIds);
      const ownSectionIds = new Set(sections.map((s) => s.sectionId));
      if (dto.audienceType === 'SECTION') {
        const notMine = (dto.targetSectionIds ?? []).filter(
          (id2) => !ownSectionIds.has(id2),
        );
        if (notMine.length > 0) {
          throw new ForbiddenException(
            'You can only target sections within your own academic scope.',
          );
        }
      } else if (
        dto.audienceType !== 'ROLE' ||
        !dto.targetRoles?.every((r) => r === 'ACADEMIC_COORDINATOR')
      ) {
        throw new ForbiddenException(
          'A coordinator notice must target your own sections, or every Academic Coordinator.',
        );
      }
    }
    return this.announcementsService.update(id, dto, personId, personId);
  }

  async deleteNotice(personId: string, id: string) {
    await this.announcementsService.remove(id, personId, personId);
  }

  // ============================================================
  // Faculty academic assignment + workload (sections 9, 22)
  // ============================================================

  async getOfferings(
    personId: string,
    filter: { gradeId?: string; sectionId?: string },
  ) {
    const scope = await this.resolveScope(personId);
    if (filter.gradeId) this.assertGradeInScope(scope, filter.gradeId);
    return this.acRepo.findOfferings(scope.gradeIds, filter);
  }

  private async assertOfferingInScope(
    scope: ResolvedScope,
    offeringId: string,
  ) {
    const offering = await this.acRepo.findOfferingById(offeringId);
    if (!offering) throw new NotFoundException('Subject offering not found');
    this.assertGradeInScope(scope, offering.gradeId);
    return offering;
  }

  async assignOfferingTeacher(
    personId: string,
    offeringId: string,
    dto: AssignOfferingTeacherDto,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOfferingInScope(scope, offeringId);
    const teacherStaffId = dto.teacherStaffId ?? null;
    if (teacherStaffId) {
      const eligible = await this.acRepo.isEligibleFacultyStaff(teacherStaffId);
      if (!eligible)
        throw new BadRequestException(
          'Selected person is not an active faculty member.',
        );
    }
    await this.acRepo.updateOfferingTeacher(offeringId, teacherStaffId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_OFFERING_TEACHER_ASSIGNED',
      objectType: 'subject_offering',
      objectId: offeringId,
      outcome: 'SUCCESS',
      afterData: { teacherStaffId },
    });
    return this.acRepo
      .findOfferings(scope.gradeIds, {})
      .then(
        (rows) => rows.find((r) => r.subjectOfferingId === offeringId) ?? null,
      );
  }

  async getEligibleFaculty(personId: string) {
    await this.resolveScope(personId);
    return this.acRepo.findEligibleFaculty();
  }

  async getFacultyWorkload(personId: string) {
    const scope = await this.resolveScope(personId);
    return this.acRepo.findFacultyWorkload(scope.gradeIds);
  }

  // ============================================================
  // Students -- real StudentRepository, server-side scoped to the
  // coordinator's own real grades (gradeIds resolved from role_assignment,
  // never trusted from the caller) so a coordinator can never read a
  // student outside their assigned stage/grades merely by knowing their id
  // or by passing a different gradeId/sectionId themselves.
  // ============================================================

  /**
   * Real per-section attendance for one date, server-side scoped to the
   * coordinator's own real sections (never trusted from the caller). Loops
   * one session lookup + one records lookup per section (bounded by how
   * many sections a coordinator actually has, typically a handful) -- there
   * is no existing cross-section rollup endpoint anywhere in this schema to
   * reuse instead (confirmed during research), so this composes the real
   * per-section data itself rather than fabricating a summary number.
   */
  async listAttendance(personId: string, date: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);

    const rows = await Promise.all(
      sections.map(async (section) => {
        const { rows: sessions } = await this.attendanceSessionRepo.findMany({
          sectionId: section.sectionId,
          dateFrom: date,
          dateTo: date,
          limit: 1,
          offset: 0,
        });
        const session = sessions[0] ?? null;
        if (!session) {
          return {
            sectionId: section.sectionId,
            gradeName: section.gradeName,
            sectionName: section.sectionName,
            studentCount: section.studentCount,
            sessionFound: false,
            isLocked: false,
            presentCount: 0,
            absentCount: 0,
            otherCount: 0,
          };
        }
        const records = await this.attendanceRecordRepo.findBySessionId(
          session.id,
          section.sectionId,
        );
        let presentCount = 0;
        let absentCount = 0;
        let otherCount = 0;
        for (const r of records) {
          if (r.status === 'PRESENT') presentCount++;
          else if (r.status === 'ABSENT') absentCount++;
          else otherCount++;
        }
        return {
          sectionId: section.sectionId,
          gradeName: section.gradeName,
          sectionName: section.sectionName,
          studentCount: section.studentCount,
          sessionFound: true,
          isLocked: session.isLocked,
          presentCount,
          absentCount,
          otherCount,
        };
      }),
    );
    return rows;
  }

  /** Throws unless sectionId is one of the coordinator's own real scoped
   * sections -- shared by every method below that takes a section id
   * directly from the caller. */
  private async assertOwnSection(scope: ResolvedScope, sectionId: string) {
    const sections = await this.acRepo.findSections(scope.gradeIds);
    if (!sections.some((s) => s.sectionId === sectionId)) {
      throw new ForbiddenException(
        'That section is outside your assigned academic scope.',
      );
    }
  }

  /** Real per-student roster for one section+date -- creates the session
   * (seeded PRESENT for every actively-enrolled student) the first time
   * it's opened for that date, exactly like the class advisor's own
   * getOrCreateRoster (faculty-attendance.service.ts) -- full parity, not a
   * read-only subset: a coordinator can open, mark, and publish a day's
   * attendance for any section in their own scope, same as the advisor. */
  async getAttendanceRoster(personId: string, sectionId: string, date: string) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    return this.unitOfWork.run(async (client) => {
      let session = await this.attendanceSessionRepo.findBySectionAndDate(
        sectionId,
        date,
        client,
      );
      if (!session) {
        session = await this.attendanceSessionRepo.create(
          sectionId,
          date,
          client,
        );
        const studentIds =
          await this.attendanceSessionRepo.findActiveEnrolledStudentIds(
            sectionId,
            client,
          );
        await this.attendanceRecordRepo.createManyPresent(
          session.id,
          studentIds,
          client,
        );
        await this.audit.record(
          {
            actorPersonId: personId,
            actorRoleCode: 'ACADEMIC_COORDINATOR',
            action: 'COORDINATOR_ATTENDANCE_SESSION_OPENED',
            objectType: 'attendance_session',
            objectId: session.id,
            outcome: 'SUCCESS',
            afterData: { ...session, rosterSize: studentIds.length },
          },
          client,
        );
      }
      const records = await this.attendanceRecordRepo.findBySessionId(
        session.id,
        sectionId,
        client,
      );
      return { session, records };
    });
  }

  private async assertRecordInCoordinatorSection(
    sectionId: string,
    recordId: string,
  ) {
    const record = await this.attendanceRecordRepo.findById(recordId);
    if (!record) throw new NotFoundException('Attendance record not found');
    const session = await this.attendanceSessionRepo.findById(
      record.sessionId,
    );
    if (!session || session.sectionId !== sectionId) {
      throw new NotFoundException('Attendance record not found');
    }
    return { record, session };
  }

  /** Full parity with the class advisor's own markRecord -- while the
   * session is still open this is a direct edit; once the advisor (or the
   * coordinator themselves) has published it, this transparently becomes a
   * correction instead (AttendanceRecordsService.update/correct already
   * enforce that boundary themselves; this never re-implements it). A
   * coordinator can do this for any section in their own scope, any day --
   * not gated to "only after publish" the way a plain read-only reviewer
   * would be. */
  async markAttendanceRecord(
    personId: string,
    sectionId: string,
    recordId: string,
    dto: MarkAttendanceRecordDto,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    const { session } = await this.assertRecordInCoordinatorSection(
      sectionId,
      recordId,
    );
    if (session.isLocked) {
      return this.attendanceRecordsService.correct(
        recordId,
        {
          newStatus: dto.status,
          reason: dto.reason ?? 'Corrected by Academic Coordinator',
        },
        personId,
      );
    }
    return this.attendanceRecordsService.update(
      recordId,
      { status: dto.status, reason: dto.reason },
      personId,
    );
  }

  /** Full parity with the class advisor's own markAllPresent. */
  async markAllPresentForSection(
    personId: string,
    sectionId: string,
    date: string,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    const { session, records } = await this.getAttendanceRoster(
      personId,
      sectionId,
      date,
    );
    for (const record of records) {
      if (record.status === 'PRESENT') continue;
      if (session!.isLocked) {
        await this.attendanceRecordsService.correct(
          record.id,
          { newStatus: 'PRESENT', reason: 'Marked all present' },
          personId,
        );
      } else {
        await this.attendanceRecordsService.update(
          record.id,
          { status: 'PRESENT' },
          personId,
        );
      }
    }
    return this.getAttendanceRoster(personId, sectionId, date);
  }

  /** Full parity with the class advisor's own publish -- a coordinator can
   * publish any section's day directly, not only the advisor. Reuses the
   * identical real session-lock primitive
   * (AcademicCoordinatorTimetableRepository is unrelated; this is
   * attendanceSessionRepo.lock, the same one faculty-attendance.service.ts
   * writes). */
  async publishAttendance(personId: string, sectionId: string, date: string) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    const { session } = await this.getAttendanceRoster(
      personId,
      sectionId,
      date,
    );
    if (!session!.isLocked) {
      await this.attendanceSessionRepo.lock(session!.id, personId);
      await this.audit.record({
        actorPersonId: personId,
        actorRoleCode: 'ACADEMIC_COORDINATOR',
        action: 'COORDINATOR_ATTENDANCE_PUBLISHED',
        objectType: 'attendance_session',
        objectId: session!.id,
        outcome: 'SUCCESS',
        afterData: { sectionId, date },
      });
    }
    return this.getAttendanceRoster(personId, sectionId, date);
  }

  // ============================================================
  // Performance -- real per-section exam results (class average, pass
  // rate, grade distribution, toppers, per-student rank), reusing the exact
  // same computation FacultyClassResultsService already provides for a
  // class advisor -- see that service's own listExamsInScope/
  // getResultsInScope, split out specifically so this scope check (coordinator
  // section) can call the same real logic a class advisor's own screen uses,
  // without repeating it.
  // ============================================================

  async listPerformanceExams(personId: string, sectionId: string) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    return this.classResultsService.listExamsInScope(sectionId);
  }

  async getPerformance(personId: string, sectionId: string, examId: string) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    return this.classResultsService.getResultsInScope(sectionId, examId);
  }

  // ============================================================
  // Marks verification -- a real, additive coordinator review layer over
  // each section's real, already-PUBLISHED exam results (the exact same
  // data Performance shows). Recorded in exam_verification, keyed by
  // (section, exam) -- never touches `mark`/`exam` state, never gates a
  // teacher's own save/publish action. See exam-verification.repository.ts's
  // own header note on why this is deliberately per-section-per-exam, not
  // per individual subject-paper.
  // ============================================================

  async listMarksSubmissions(personId: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const decisions = await this.examVerificationRepo.findForSections(
      sections.map((s) => s.sectionId),
    );
    const decisionKey = (sectionId: string, examId: string) =>
      `${sectionId}:${examId}`;
    const decisionMap = new Map(
      decisions.map((d) => [decisionKey(d.sectionId, d.examId), d]),
    );

    const perSection = await Promise.all(
      sections.map(async (section) => {
        const exams = await this.classResultsService.listExamsInScope(
          section.sectionId,
        );
        return exams.map((exam) => {
          const decision = decisionMap.get(
            decisionKey(section.sectionId, exam.examId),
          );
          return {
            sectionId: section.sectionId,
            gradeName: section.gradeName,
            sectionName: section.sectionName,
            examId: exam.examId,
            examName: exam.examName,
            examType: exam.examType,
            term: exam.term,
            status: decision?.status ?? 'PENDING',
            comment: decision?.comment ?? null,
            decidedAt: decision?.decidedAt ?? null,
          };
        });
      }),
    );
    return perSection.flat();
  }

  async getMarksSubmissionDetail(
    personId: string,
    sectionId: string,
    examId: string,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    const [results, decision] = await Promise.all([
      this.classResultsService.getResultsInScope(sectionId, examId),
      this.examVerificationRepo.findOne(sectionId, examId),
    ]);
    return {
      ...results,
      status: decision?.status ?? 'PENDING',
      comment: decision?.comment ?? null,
      decidedAt: decision?.decidedAt ?? null,
    };
  }

  async verifyMarksSubmission(
    personId: string,
    sectionId: string,
    examId: string,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    // Reuses the exact real computation Performance shows -- if the exam
    // isn't actually a real, published exam for this section, this throws
    // rather than letting a coordinator "verify" a non-existent submission.
    await this.classResultsService.getResultsInScope(sectionId, examId);
    await this.examVerificationRepo.setDecision(
      sectionId,
      examId,
      'VERIFIED',
      null,
      personId,
    );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_MARKS_VERIFIED',
      objectType: 'exam_verification',
      objectId: `${sectionId}:${examId}`,
      outcome: 'SUCCESS',
    });
    return { status: 'VERIFIED' as const };
  }

  async sendBackMarksSubmission(
    personId: string,
    sectionId: string,
    examId: string,
    dto: SendBackMarksSubmissionDto,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnSection(scope, sectionId);
    await this.classResultsService.getResultsInScope(sectionId, examId);
    await this.examVerificationRepo.setDecision(
      sectionId,
      examId,
      'SENT_BACK',
      dto.comment,
      personId,
    );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_MARKS_SENT_BACK',
      objectType: 'exam_verification',
      objectId: `${sectionId}:${examId}`,
      outcome: 'SUCCESS',
      afterData: { comment: dto.comment },
    });
    return { status: 'SENT_BACK' as const };
  }

  async listStudents(
    personId: string,
    filter: { search?: string; sectionId?: string; page?: number; limit?: number },
  ) {
    const scope = await this.resolveScope(personId);
    if (filter.sectionId) {
      await this.assertOwnSection(scope, filter.sectionId);
    }
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 100;
    const { rows, total } = await this.studentRepo.findMany({
      search: filter.search,
      sectionId: filter.sectionId,
      gradeIds: scope.gradeIds,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  /** A coordinator's real, full-profile read on one student -- same real
   * services faculty-student-detail.service.ts already composes
   * (StudentsService.get, GuardianLinksService.listByStudent,
   * AttendanceRecordsService.getAttendanceSummaryForStudent,
   * StudentFeesService.getSummaryForStudent), just gated by the
   * coordinator's own real grade scope instead of "class advisor of this
   * section" -- never a second copy of the underlying fetch logic. */
  async getStudentDetail(personId: string, studentId: string) {
    const scope = await this.resolveScope(personId);
    const student = await this.studentsService.get(studentId);
    if (!student.gradeId || !scope.gradeIds.includes(student.gradeId)) {
      throw new ForbiddenException(
        'You are only able to view students within your own academic scope.',
      );
    }
    const [guardians, attendance, fees] = await Promise.all([
      this.guardianLinksService.listByStudent(studentId),
      this.attendanceRecordsService.getAttendanceSummaryForStudent(studentId),
      this.studentFeesService.getSummaryForStudent(studentId),
    ]);
    return { student, guardians, attendance, fees };
  }

  // ============================================================
  // Class Advisor assignment (section 10)
  // ============================================================

  async assignClassAdvisor(
    personId: string,
    sectionId: string,
    dto: AssignClassAdvisorDto,
  ) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section)
      throw new NotFoundException('Section not found in your scope');

    const eligibleStaffId = await this.acRepo.isEligibleFacultyPerson(
      dto.personId,
    );
    if (!eligibleStaffId)
      throw new BadRequestException(
        'Selected person is not an active faculty member.',
      );

    // A class's advisor is its constant Class Teacher login; the coordinator
    // changes WHO stands behind it (same hand-over as the admin screen: previous
    // holder signed out, password rotated). Writing a direct role on the
    // faculty member's own login would give the section two advisors.
    const login = await this.classTeacherLogins.findByGradeSection(
      section.gradeId,
      section.sectionName,
    );
    if (!login) {
      throw new BadRequestException(
        'This class has no class teacher login yet. Ask the administrator to create it first.',
      );
    }
    await this.classTeacherLogins.reassign(
      login.loginPersonId,
      { sectionId, facultyPersonId: dto.personId, rotatePassword: true },
      personId,
    );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CLASS_ADVISOR_ASSIGNED',
      objectType: 'person',
      objectId: login.loginPersonId,
      outcome: 'SUCCESS',
      afterData: { sectionId, facultyPersonId: dto.personId },
    });
    return { classTeacherLoginId: login.loginPersonId };
  }

  async revokeClassAdvisor(personId: string, sectionId: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section)
      throw new NotFoundException('Section not found in your scope');
    const login = await this.classTeacherLogins.findByGradeSection(
      section.gradeId,
      section.sectionName,
    );
    if (!login) {
      throw new NotFoundException('This section has no class teacher login to vacate');
    }
    await this.classTeacherLogins.vacate(login.loginPersonId, personId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CLASS_ADVISOR_REVOKED',
      objectType: 'person',
      objectId: login.loginPersonId,
      outcome: 'SUCCESS',
    });
  }

  // ============================================================
  // Class Timetable (section 13) -- draft-then-publish over the real
  // timetable_slot table; the DB's own trigger enforces "no teacher
  // double-booked", this only ever surfaces that as a friendly error.
  // ============================================================

  async getTimetable(personId: string, sectionId: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section)
      throw new NotFoundException('Section not found in your scope');
    const grades = await this.acRepo.findGrades(scope.gradeIds);
    const grade = grades.find((g) => g.gradeId === section.gradeId);
    const [periods, slots] = await Promise.all([
      this.ttRepo.findPeriodsForStage(grade?.stage ?? ''),
      this.ttRepo.findSlotsForSection(sectionId),
    ]);
    return { section, periods, slots };
  }

  async upsertTimetableSlot(personId: string, dto: UpsertTimetableSlotDto) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const section = sections.find((s) => s.sectionId === dto.sectionId);
    if (!section)
      throw new NotFoundException('Section not found in your scope');
    const offering = await this.acRepo.findOfferingById(dto.subjectOfferingId);
    if (!offering || offering.sectionId !== dto.sectionId) {
      throw new BadRequestException(
        'That subject offering does not belong to this section.',
      );
    }
    const slotId = await this.ttRepo.upsertDraftSlot(dto);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_TIMETABLE_SLOT_DRAFTED',
      objectType: 'timetable_slot',
      objectId: slotId,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return { slotId };
  }

  async deleteTimetableSlot(personId: string, slotId: string) {
    const scope = await this.resolveScope(personId);
    const sectionId = await this.ttRepo.findSlotSectionId(slotId);
    if (!sectionId) throw new NotFoundException('Slot not found');
    const sections = await this.acRepo.findSections(scope.gradeIds);
    if (!sections.some((s) => s.sectionId === sectionId))
      throw new ForbiddenException('That section is outside your scope.');
    const deleted = await this.ttRepo.deleteDraftSlot(slotId);
    if (!deleted)
      throw new BadRequestException(
        'Only a not-yet-published draft slot can be deleted.',
      );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_TIMETABLE_SLOT_DELETED',
      objectType: 'timetable_slot',
      objectId: slotId,
      outcome: 'SUCCESS',
    });
  }

  async publishTimetable(personId: string, sectionId: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    if (!sections.some((s) => s.sectionId === sectionId))
      throw new NotFoundException('Section not found in your scope');
    const count = await this.ttRepo.publishSectionDrafts(sectionId);
    if (count > 0) await this.ttRepo.notifyTimetablePublished(sectionId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_TIMETABLE_PUBLISHED',
      objectType: 'section',
      objectId: sectionId,
      outcome: 'SUCCESS',
      afterData: { publishedSlotCount: count },
    });
    return { publishedSlotCount: count };
  }

  // ============================================================
  // Examination configuration + readiness monitoring (sections 14-17)
  // ============================================================

  async listExams(personId: string) {
    const scope = await this.resolveScope(personId);
    return this.examRepo.findExamsForGrades(scope.gradeIds);
  }

  private async assertExamInScope(scope: ResolvedScope, examId: string) {
    const gradeIds = await this.examRepo.findExamGradeIds(examId);
    if (gradeIds.length === 0) throw new NotFoundException('Exam not found');
    if (!gradeIds.some((id) => scope.gradeIds.includes(id))) {
      throw new ForbiddenException(
        'That exam is outside your assigned academic scope.',
      );
    }
  }

  async createExam(personId: string, dto: CreateCoordinatorExamDto) {
    const scope = await this.resolveScope(personId);
    for (const gradeId of dto.gradeIds) this.assertGradeInScope(scope, gradeId);
    const academicYearId = await this.acRepo.findCurrentAcademicYearId();
    const examId = await this.examRepo.createExam({
      academicYearId,
      name: dto.name,
      examType: dto.examType,
      term: dto.term,
      gradeIds: dto.gradeIds,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_EXAM_CREATED',
      objectType: 'exam',
      objectId: examId,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return { examId };
  }

  async advanceExamState(personId: string, examId: string) {
    const scope = await this.resolveScope(personId);
    await this.assertExamInScope(scope, examId);
    const next = await this.examRepo.advanceExamState(examId);
    if (!next)
      throw new BadRequestException(
        'This exam cannot be advanced any further from its current state.',
      );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_EXAM_STATE_ADVANCED',
      objectType: 'exam',
      objectId: examId,
      outcome: 'SUCCESS',
      afterData: { state: next },
    });
    return { state: next };
  }

  async listExamSubjects(personId: string, examId: string) {
    const scope = await this.resolveScope(personId);
    await this.assertExamInScope(scope, examId);
    return this.examRepo.findExamSubjects(examId, scope.gradeIds);
  }

  async createExamSubject(
    personId: string,
    examId: string,
    dto: CreateExamSubjectDto,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertExamInScope(scope, examId);
    const offering = await this.assertOfferingInScope(
      scope,
      dto.subjectOfferingId,
    );
    const examGradeIds = await this.examRepo.findExamGradeIds(examId);
    if (!examGradeIds.includes(offering.gradeId)) {
      throw new BadRequestException(
        "That class's grade is not one of this exam's configured grades.",
      );
    }
    const id = await this.examRepo.createExamSubject({ ...dto, examId });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_EXAM_SUBJECT_CREATED',
      objectType: 'exam_subject',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return { examSubjectId: id };
  }

  async updateExamSubject(
    personId: string,
    examSubjectId: string,
    dto: UpdateExamSubjectDto,
  ) {
    const scope = await this.resolveScope(personId);
    const offeringId =
      await this.examRepo.findExamSubjectOffering(examSubjectId);
    if (!offeringId) throw new NotFoundException('Exam subject not found');
    await this.assertOfferingInScope(scope, offeringId);
    await this.examRepo.updateExamSubject(examSubjectId, dto);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_EXAM_SUBJECT_UPDATED',
      objectType: 'exam_subject',
      objectId: examSubjectId,
      outcome: 'SUCCESS',
      afterData: dto,
    });
  }

  async getExamReadiness(personId: string, examId: string) {
    const scope = await this.resolveScope(personId);
    await this.assertExamInScope(scope, examId);
    return this.examRepo.findReadiness(examId, scope.gradeIds);
  }

  /** Real exam.marks_entry_opens_at/closes_at columns -- see
   * academic-coordinator-exam.repository.ts's own setMarksEntryWindow for
   * what this is (and isn't yet) wired to. */
  async setMarksEntryWindow(
    personId: string,
    examId: string,
    dto: SetMarksEntryWindowDto,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertExamInScope(scope, examId);
    await this.examRepo.setMarksEntryWindow(
      examId,
      dto.opensAt ?? null,
      dto.closesAt ?? null,
    );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_MARKS_ENTRY_WINDOW_SET',
      objectType: 'exam',
      objectId: examId,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return { opensAt: dto.opensAt ?? null, closesAt: dto.closesAt ?? null };
  }

  // ============================================================
  // Academic Calendar (section 18) -- the real calendar_event table, always
  // STAGE-scoped to a stage the coordinator actually holds.
  // ============================================================

  async listCalendarEvents(personId: string) {
    const scope = await this.resolveScope(personId);
    return this.calendarRepo.findForStages(scope.stages);
  }

  private assertStageInScope(scope: ResolvedScope, stage: string) {
    if (!scope.stages.includes(stage)) {
      throw new ForbiddenException(
        'That stage is outside your assigned academic scope.',
      );
    }
  }

  async createCalendarEvent(
    personId: string,
    dto: CreateCoordinatorCalendarEventDto,
  ) {
    const scope = await this.resolveScope(personId);
    this.assertStageInScope(scope, dto.scopeStage);
    const academicYearId = await this.acRepo.findCurrentAcademicYearId();
    const id = await this.calendarRepo.create({
      ...dto,
      academicYearId,
      createdBy: personId,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CALENDAR_EVENT_CREATED',
      objectType: 'calendar_event',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return { id };
  }

  private async assertOwnsCalendarEvent(scope: ResolvedScope, id: string) {
    const event = await this.calendarRepo.findById(id);
    if (!event || event.scopeType !== 'STAGE' || !event.scopeStage)
      throw new NotFoundException('Calendar event not found');
    this.assertStageInScope(scope, event.scopeStage);
    return event;
  }

  async updateCalendarEvent(
    personId: string,
    id: string,
    dto: UpdateCoordinatorCalendarEventDto,
  ) {
    const scope = await this.resolveScope(personId);
    await this.assertOwnsCalendarEvent(scope, id);
    await this.calendarRepo.update(id, dto);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CALENDAR_EVENT_UPDATED',
      objectType: 'calendar_event',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
  }

  async deleteCalendarEvent(personId: string, id: string) {
    const scope = await this.resolveScope(personId);
    const event = await this.assertOwnsCalendarEvent(scope, id);
    await this.calendarRepo.delete(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CALENDAR_EVENT_DELETED',
      objectType: 'calendar_event',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: event,
    });
  }

  // ============================================================
  // Syllabus tracking -- real syllabus_unit/syllabus_progress tables
  // (already populated), see academic-coordinator-syllabus.repository.ts's
  // own header note. Read-only here -- actually marking a unit done stays
  // the subject teacher's own job, exactly like Marks Entry/Performance.
  // ============================================================

  async listSyllabusCoverage(personId: string) {
    const scope = await this.resolveScope(personId);
    return this.syllabusRepo.findCoverageForGrades(scope.gradeIds);
  }

  // ============================================================
  // Academic approvals -- a real, actionable worklist of academic-admin
  // items genuinely pending the Coordinator's own decision: a subject
  // offering with no teacher assigned, or a section with no class advisor.
  // Both conditions and both resolving actions (assignOfferingTeacher,
  // assignClassAdvisor) already exist and are real -- this is not a new
  // approval workflow, just the same two real gaps the Dashboard already
  // counts, surfaced here as one actionable list instead of just a number.
  // The generic approval_request/approval_policy engine this schema also
  // has was checked and confirmed to have no ACADEMIC_COORDINATOR
  // approver_role_code registered anywhere today -- nothing routes there
  // for this role, so it is deliberately not used here.
  // ============================================================

  async listAcademicApprovals(personId: string) {
    const scope = await this.resolveScope(personId);
    const [offerings, sections] = await Promise.all([
      this.acRepo.findOfferings(scope.gradeIds, {}),
      this.acRepo.findSections(scope.gradeIds),
    ]);
    const unassignedOfferings = offerings
      .filter((o) => !o.teacherStaffId)
      .map((o) => ({
        type: 'UNASSIGNED_OFFERING' as const,
        subjectOfferingId: o.subjectOfferingId,
        title: `${o.subjectName} · ${o.gradeName} ${o.sectionName}`,
        detail: 'No teacher assigned to this subject offering.',
      }));
    const sectionsWithoutAdvisor = sections
      .filter((s) => !s.advisorRoleAssignmentId)
      .map((s) => ({
        type: 'MISSING_ADVISOR' as const,
        sectionId: s.sectionId,
        title: `${s.gradeName} ${s.sectionName}`,
        detail: 'No class advisor assigned to this section.',
      }));
    return { unassignedOfferings, sectionsWithoutAdvisor };
  }

  // ============================================================
  // Reports -- a real, composed grade-wise summary over data this module
  // already computes elsewhere (Attendance, Performance, Syllabus tracking,
  // faculty workload, Academic approvals) -- never a second, fabricated
  // number. Each section uses its OWN most recent exam that actually has
  // published results for it (via the same listExamsInScope/getResultsInScope
  // Performance uses) -- deliberately not one single "latest exam across the
  // whole scope" id, since different sections are commonly at different
  // points in the exam cycle and forcing one shared exam id either produces
  // a table with only the one section that happens to share it, or drags in
  // whatever exam was created last (including non-academic test/QA fixture
  // exams already present in this database) even where it has no real
  // relevance to most of the scope. A section simply has no row if it has no
  // published exam of its own yet -- real absence, not padded with zeros.
  // ============================================================

  async getReports(personId: string) {
    const scope = await this.resolveScope(personId);
    const [grades, sections, offerings, syllabusRows] = await Promise.all([
      this.acRepo.findGrades(scope.gradeIds),
      this.acRepo.findSections(scope.gradeIds),
      this.acRepo.findOfferings(scope.gradeIds, {}),
      this.syllabusRepo.findCoverageForGrades(scope.gradeIds),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const attendanceRows = await this.listAttendance(personId, today);

    const classResults: {
      sectionId: string;
      gradeName: string;
      sectionName: string;
      advisorName: string | null;
      examName: string;
      strength: number;
      appeared: number;
      passPercent: number | null;
      average: number | null;
      below35: number;
    }[] = [];
    const subjectTotals = new Map<string, { sum: number; count: number }>();

    for (const section of sections) {
      const sectionExams = await this.classResultsService.listExamsInScope(
        section.sectionId,
      );
      const latestForSection = sectionExams[0];
      if (!latestForSection) continue;
      const result = await this.classResultsService.getResultsInScope(
        section.sectionId,
        latestForSection.examId,
      );
      if (result.students.length === 0) continue;
      const appeared = result.students.filter((s) => s.percent !== null).length;
      classResults.push({
        sectionId: section.sectionId,
        gradeName: section.gradeName,
        sectionName: section.sectionName,
        advisorName: section.advisorName,
        examName: latestForSection.examName,
        strength: result.students.length,
        appeared,
        passPercent:
          result.students.length > 0
            ? Math.round((result.pass.count / result.students.length) * 100)
            : null,
        average: result.classAvg,
        below35: result.students.filter(
          (s) => s.percent !== null && s.percent < 35,
        ).length,
      });
      for (const student of result.students) {
        for (const subj of student.subjects) {
          if (subj.isAbsent || subj.marksObtained === null) continue;
          const pct = (subj.marksObtained / subj.maxMarks) * 100;
          const entry = subjectTotals.get(subj.subjectName) ?? {
            sum: 0,
            count: 0,
          };
          entry.sum += pct;
          entry.count += 1;
          subjectTotals.set(subj.subjectName, entry);
        }
      }
    }
    const subjectPerformance = [...subjectTotals.entries()]
      .map(([subjectName, { sum, count }]) => ({
        subjectName,
        average: Math.round(sum / count),
      }))
      .sort((a, b) => b.average - a.average);

    const unassignedOfferings = offerings.filter(
      (o) => !o.teacherStaffId,
    ).length;
    const sectionsWithoutAdvisor = sections.filter(
      (s) => !s.advisorRoleAssignmentId,
    ).length;

    const avgSyllabusPercent =
      syllabusRows.length > 0
        ? Math.round(
            syllabusRows.reduce((sum, r) => sum + r.percent, 0) /
              syllabusRows.length,
          )
        : null;

    const attendanceMarked = attendanceRows.filter((r) => r.sessionFound);
    const totalPresent = attendanceMarked.reduce(
      (sum, r) => sum + r.presentCount,
      0,
    );
    const totalMarkedStudents = attendanceMarked.reduce(
      (sum, r) => sum + r.presentCount + r.absentCount + r.otherCount,
      0,
    );
    const avgAttendancePercent =
      totalMarkedStudents > 0
        ? Math.round((totalPresent / totalMarkedStudents) * 100)
        : null;

    const avgExamPercent =
      classResults.length > 0
        ? Math.round(
            classResults.reduce((sum, r) => sum + (r.average ?? 0), 0) /
              classResults.filter((r) => r.average !== null).length,
          )
        : null;

    return {
      stages: scope.stages,
      gradeCount: grades.length,
      studentCount: grades.reduce((sum, g) => sum + g.studentCount, 0),
      kpis: {
        avgExamPercent,
        avgSyllabusPercent,
        avgAttendancePercent,
        openApprovals: unassignedOfferings + sectionsWithoutAdvisor,
      },
      classResults,
      subjectPerformance,
      attendance: attendanceRows,
      syllabus: syllabusRows,
    };
  }

  // ============================================================
  // Substitute teacher -- real "who's absent today" (an APPROVED
  // staff_leave_request covering the date -- the one real absence signal
  // this schema has), real gaps (that teacher's own published
  // timetable_slot rows for the day), real ranked-by-load free candidates
  // (every other in-scope teacher not already occupied at that exact
  // day+period, computed fresh, never cached), and real persisted
  // assignments in the previously-unused `substitution` table. Never a
  // fabricated "auto-detected absence" -- if no one has an approved leave
  // for the date, there are simply no gaps to show.
  // ============================================================

  async listSubstituteGaps(personId: string, date: string) {
    const scope = await this.resolveScope(personId);
    const workload = await this.acRepo.findFacultyWorkload(scope.gradeIds);
    if (workload.length === 0) return { gaps: [], absentTeachers: [] };

    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const staffIds = workload.map((w) => w.staffId);
    const approvedLeaves =
      await this.staffLeaveRequestRepo.findApprovedForDateAndStaff(
        staffIds,
        date,
      );
    const absentStaffIds = [...new Set(approvedLeaves.map((l) => l.staffId))];
    if (absentStaffIds.length === 0) return { gaps: [], absentTeachers: [] };

    // Every in-scope teacher's real published slots for this exact day of
    // week -- built once, reused both to find each absent teacher's real
    // gaps and to compute who else is genuinely free at that period.
    const allSchedules = await Promise.all(
      workload.map(async (t) => ({
        staffId: t.staffId,
        name: t.name,
        weeklyPeriods: t.weeklyPeriods,
        slots: (await this.timetableService.getForTeacher(t.staffId)).filter(
          (s) => s.dayOfWeek === dayOfWeek,
        ),
      })),
    );
    const occupiedByPeriod = new Map<string, Set<string>>();
    for (const t of allSchedules) {
      for (const slot of t.slots) {
        if (!occupiedByPeriod.has(slot.periodId))
          occupiedByPeriod.set(slot.periodId, new Set());
        occupiedByPeriod.get(slot.periodId)!.add(t.staffId);
      }
    }

    const existingSubs = await this.substitutionRepo.findForDateAndStaff(
      absentStaffIds,
      date,
    );
    const subByTimetableSlotId = new Map(
      existingSubs.map((s) => [s.timetableSlotId, s]),
    );

    const gaps = absentStaffIds.flatMap((staffId) => {
      const teacher = allSchedules.find((t) => t.staffId === staffId)!;
      return teacher.slots.map((slot) => {
        const freeCandidates = allSchedules
          .filter(
            (t) =>
              t.staffId !== staffId &&
              !occupiedByPeriod.get(slot.periodId)?.has(t.staffId),
          )
          .sort((a, b) => a.weeklyPeriods - b.weeklyPeriods)
          .map((t) => ({
            staffId: t.staffId,
            name: t.name,
            weeklyPeriods: t.weeklyPeriods,
          }));
        const existing = subByTimetableSlotId.get(slot.id);
        return {
          timetableSlotId: slot.id,
          periodId: slot.periodId,
          periodNo: slot.periodNo,
          startTime: slot.startTime,
          sectionId: slot.sectionId,
          gradeName: slot.gradeName,
          sectionName: slot.sectionName,
          subjectName: slot.subjectName,
          absentStaffId: staffId,
          absentTeacherName: teacher.name,
          assignedSubstituteStaffId: existing?.substituteStaffId ?? null,
          candidates: freeCandidates,
        };
      });
    });

    return {
      gaps,
      absentTeachers: absentStaffIds.map((id) => {
        const t = allSchedules.find((s) => s.staffId === id)!;
        return { staffId: id, name: t.name };
      }),
    };
  }

  async assignSubstitution(personId: string, dto: AssignSubstitutionDto) {
    const scope = await this.resolveScope(personId);
    const originalSlots = await this.timetableService.getForTeacher(
      dto.originalStaffId,
    );
    const slot = originalSlots.find((s) => s.id === dto.timetableSlotId);
    if (!slot) throw new NotFoundException('Timetable period not found.');
    await this.assertOwnSection(scope, slot.sectionId);

    const workload = await this.acRepo.findFacultyWorkload(scope.gradeIds);
    if (!workload.some((w) => w.staffId === dto.substituteStaffId)) {
      throw new BadRequestException(
        'Selected substitute is not an active faculty member in your scope.',
      );
    }
    const substituteSlots = await this.timetableService.getForTeacher(
      dto.substituteStaffId,
    );
    const isBusy = substituteSlots.some(
      (s) => s.dayOfWeek === slot.dayOfWeek && s.periodId === slot.periodId,
    );
    if (isBusy) {
      throw new ConflictException(
        'That teacher is already teaching another class at this exact period.',
      );
    }

    const id = await this.substitutionRepo.upsert({
      timetableSlotId: dto.timetableSlotId,
      subDate: dto.subDate,
      originalStaffId: dto.originalStaffId,
      substituteStaffId: dto.substituteStaffId,
      reason: dto.reason ?? null,
      assignedBy: personId,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_SUBSTITUTION_ASSIGNED',
      objectType: 'substitution',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return { id };
  }
}
