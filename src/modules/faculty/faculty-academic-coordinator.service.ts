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

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
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
  ) {}

  // ============================================================
  // Scope resolution -- the one gate every method below runs through first.
  // ============================================================

  private async resolveScope(personId: string): Promise<ResolvedScope> {
    const raw = await this.scopeRepo.getCoordinatorScope(personId);
    if (raw.length === 0) {
      throw new ForbiddenException('You are not currently assigned as an Academic Coordinator.');
    }
    const stages = [...new Set(raw.filter((r) => r.scopeType === 'STAGE').map((r) => r.scopeStage as string))];
    const explicitGradeIds = raw.filter((r) => r.scopeType === 'GRADE').map((r) => r.scopeId as string);
    const schoolWide = raw.some((r) => r.scopeType === 'SCHOOL');
    const gradeIds = await this.acRepo.resolveGradeIdsForScope(stages, explicitGradeIds, schoolWide);
    const grades = await this.acRepo.findGrades(gradeIds);
    const effectiveStages = [...new Set([...stages, ...grades.map((g) => g.stage)])];
    return { gradeIds, stages: effectiveStages };
  }

  private assertGradeInScope(scope: ResolvedScope, gradeId: string) {
    if (!scope.gradeIds.includes(gradeId)) {
      throw new ForbiddenException('That grade is outside your assigned academic scope.');
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
    if (raw.length === 0) return { isCoordinator: false, stages: [], grades: [] };
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
    const unassignedOfferings = offerings.filter((o) => !o.teacherStaffId).length;
    const sectionsWithoutAdvisor = sections.filter((s) => !s.advisorRoleAssignmentId).length;
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
    const sections = await this.acRepo.findSections(gradeId ? [gradeId] : scope.gradeIds);
    return sections;
  }

  // ============================================================
  // Faculty academic assignment + workload (sections 9, 22)
  // ============================================================

  async getOfferings(personId: string, filter: { gradeId?: string; sectionId?: string }) {
    const scope = await this.resolveScope(personId);
    if (filter.gradeId) this.assertGradeInScope(scope, filter.gradeId);
    return this.acRepo.findOfferings(scope.gradeIds, filter);
  }

  private async assertOfferingInScope(scope: ResolvedScope, offeringId: string) {
    const offering = await this.acRepo.findOfferingById(offeringId);
    if (!offering) throw new NotFoundException('Subject offering not found');
    this.assertGradeInScope(scope, offering.gradeId);
    return offering;
  }

  async assignOfferingTeacher(personId: string, offeringId: string, dto: AssignOfferingTeacherDto) {
    const scope = await this.resolveScope(personId);
    await this.assertOfferingInScope(scope, offeringId);
    const teacherStaffId = dto.teacherStaffId ?? null;
    if (teacherStaffId) {
      const eligible = await this.acRepo.isEligibleFacultyStaff(teacherStaffId);
      if (!eligible) throw new BadRequestException('Selected person is not an active faculty member.');
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
    return this.acRepo.findOfferings(scope.gradeIds, {}).then((rows) => rows.find((r) => r.subjectOfferingId === offeringId) ?? null);
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
  // Class Advisor assignment (section 10)
  // ============================================================

  async assignClassAdvisor(personId: string, sectionId: string, dto: AssignClassAdvisorDto) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section) throw new NotFoundException('Section not found in your scope');

    const eligibleStaffId = await this.acRepo.isEligibleFacultyPerson(dto.personId);
    if (!eligibleStaffId) throw new BadRequestException('Selected person is not an active faculty member.');

    if (section.advisorRoleAssignmentId) {
      await this.acRepo.revokeRoleAssignment(section.advisorRoleAssignmentId, personId);
    }
    const newId = await this.acRepo.createClassAdvisorAssignment(sectionId, dto.personId, personId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CLASS_ADVISOR_ASSIGNED',
      objectType: 'role_assignment',
      objectId: newId,
      outcome: 'SUCCESS',
      afterData: { sectionId, personId: dto.personId },
    });
    return { roleAssignmentId: newId };
  }

  async revokeClassAdvisor(personId: string, sectionId: string) {
    const scope = await this.resolveScope(personId);
    const sections = await this.acRepo.findSections(scope.gradeIds);
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section) throw new NotFoundException('Section not found in your scope');
    if (!section.advisorRoleAssignmentId) throw new NotFoundException('This section has no active advisor to revoke');
    await this.acRepo.revokeRoleAssignment(section.advisorRoleAssignmentId, personId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'ACADEMIC_COORDINATOR',
      action: 'COORDINATOR_CLASS_ADVISOR_REVOKED',
      objectType: 'role_assignment',
      objectId: section.advisorRoleAssignmentId,
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
    if (!section) throw new NotFoundException('Section not found in your scope');
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
    if (!section) throw new NotFoundException('Section not found in your scope');
    const offering = await this.acRepo.findOfferingById(dto.subjectOfferingId);
    if (!offering || offering.sectionId !== dto.sectionId) {
      throw new BadRequestException('That subject offering does not belong to this section.');
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
    if (!sections.some((s) => s.sectionId === sectionId)) throw new ForbiddenException('That section is outside your scope.');
    const deleted = await this.ttRepo.deleteDraftSlot(slotId);
    if (!deleted) throw new BadRequestException('Only a not-yet-published draft slot can be deleted.');
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
    if (!sections.some((s) => s.sectionId === sectionId)) throw new NotFoundException('Section not found in your scope');
    const count = await this.ttRepo.publishSectionDrafts(sectionId);
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
      throw new ForbiddenException('That exam is outside your assigned academic scope.');
    }
  }

  async createExam(personId: string, dto: CreateCoordinatorExamDto) {
    const scope = await this.resolveScope(personId);
    for (const gradeId of dto.gradeIds) this.assertGradeInScope(scope, gradeId);
    const academicYearId = await this.acRepo.findCurrentAcademicYearId();
    const examId = await this.examRepo.createExam({ academicYearId, name: dto.name, examType: dto.examType, term: dto.term, gradeIds: dto.gradeIds });
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
    if (!next) throw new BadRequestException('This exam cannot be advanced any further from its current state.');
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

  async createExamSubject(personId: string, examId: string, dto: CreateExamSubjectDto) {
    const scope = await this.resolveScope(personId);
    await this.assertExamInScope(scope, examId);
    const offering = await this.assertOfferingInScope(scope, dto.subjectOfferingId);
    const examGradeIds = await this.examRepo.findExamGradeIds(examId);
    if (!examGradeIds.includes(offering.gradeId)) {
      throw new BadRequestException("That class's grade is not one of this exam's configured grades.");
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

  async updateExamSubject(personId: string, examSubjectId: string, dto: UpdateExamSubjectDto) {
    const scope = await this.resolveScope(personId);
    const offeringId = await this.examRepo.findExamSubjectOffering(examSubjectId);
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
      throw new ForbiddenException('That stage is outside your assigned academic scope.');
    }
  }

  async createCalendarEvent(personId: string, dto: CreateCoordinatorCalendarEventDto) {
    const scope = await this.resolveScope(personId);
    this.assertStageInScope(scope, dto.scopeStage);
    const academicYearId = await this.acRepo.findCurrentAcademicYearId();
    const id = await this.calendarRepo.create({ ...dto, academicYearId, createdBy: personId });
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
    if (!event || event.scopeType !== 'STAGE' || !event.scopeStage) throw new NotFoundException('Calendar event not found');
    this.assertStageInScope(scope, event.scopeStage);
    return event;
  }

  async updateCalendarEvent(personId: string, id: string, dto: UpdateCoordinatorCalendarEventDto) {
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
}
