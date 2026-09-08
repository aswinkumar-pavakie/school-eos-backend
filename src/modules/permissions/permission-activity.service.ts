// Faculty-facing orchestration: create/list/detail/update/cancel/status for
// permission_activity, plus the per-student permission_request rows an activity
// fans out into. The single invariant every method funnels through is
// getAuthorizedActivityOrThrow / the section-authorization check inside create --
// never created_by_staff_id alone (see module README "Faculty authorization").

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { AuditService } from '../../common/audit/audit.service';
import { PERMISSION_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreatePermissionActivityDto } from './dto/create-permission-activity.dto';
import { UpdatePermissionActivityDto } from './dto/update-permission-activity.dto';
import { effectiveStatus } from './permission-status.util';
import { ClassAdvisorRepository } from './repositories/class-advisor.repository';
import {
  PermissionActivityRepository,
  PermissionActivityView,
} from './repositories/permission-activity.repository';
import {
  PermissionRequestRepository,
  StatusSummary,
} from './repositories/permission-request.repository';
import { PersonRepository } from './repositories/person.repository';
import { SectionRepository } from './repositories/section.repository';
import { StaffRepository } from './repositories/staff.repository';
import { StudentEnrolmentRepository } from './repositories/student-enrolment.repository';
import {
  SectionYearContext,
  SubjectOfferingRepository,
} from './repositories/subject-offering.repository';

export interface PermissionActivityDto extends PermissionActivityView {
  studentCount: number;
}

export interface FacultySectionDto {
  sectionId: string;
  academicYearId: string;
  gradeName: string;
  sectionName: string;
}

export interface StudentRequestSummaryDto {
  requestId: string;
  studentId: string;
  studentName: string;
  status: string;
  responderName: string | null;
  signedAt: Date | null;
  declineReason: string | null;
}

@Injectable()
export class PermissionActivityService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly subjectOfferingRepo: SubjectOfferingRepository,
    private readonly classAdvisorRepo: ClassAdvisorRepository,
    private readonly sectionRepo: SectionRepository,
    private readonly studentEnrolmentRepo: StudentEnrolmentRepository,
    private readonly activityRepo: PermissionActivityRepository,
    private readonly requestRepo: PermissionRequestRepository,
    private readonly personRepo: PersonRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ---- Faculty identity + live authorization --------------------------------------

  private async requireActiveFaculty(
    actor: AuthenticatedUser,
  ): Promise<{ id: string; personId: string }> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE') {
      throw new ForbiddenException(PERMISSION_ERRORS.NOT_ACTIVE_FACULTY);
    }
    return staff;
  }

  /** Union of active subject-teaching sections + active CLASS_ADVISOR sections,
   * deduplicated by (section, year) -- a faculty teaching multiple subjects in the
   * same section, or holding both roles, is authorized exactly once, never twice. */
  private async getAuthorizedSections(
    staffId: string,
    personId: string,
  ): Promise<SectionYearContext[]> {
    const [teaching, advising] = await Promise.all([
      this.subjectOfferingRepo.findActiveSectionsForTeacher(staffId),
      this.classAdvisorRepo.findActiveSectionsForAdvisor(personId),
    ]);
    const seen = new Map<string, SectionYearContext>();
    for (const ctx of [...teaching, ...advising]) {
      seen.set(`${ctx.sectionId}:${ctx.academicYearId}`, ctx);
    }
    return [...seen.values()];
  }

  private async isAuthorizedForSection(
    staffId: string,
    personId: string,
    sectionId: string,
    academicYearId: string,
  ): Promise<boolean> {
    const sections = await this.getAuthorizedSections(staffId, personId);
    return sections.some(
      (s) => s.sectionId === sectionId && s.academicYearId === academicYearId,
    );
  }

  /** Loads the activity and re-verifies, live, that this faculty is CURRENTLY
   * authorized for its (section, academic_year) -- never from created_by_staff_id.
   * Identical 404 whether the activity doesn't exist or authorization has since
   * lapsed (reassignment, revoked class-advisor role) -- never distinguishable. */
  private async getAuthorizedActivityOrThrow(
    staffId: string,
    personId: string,
    activityId: string,
  ): Promise<PermissionActivityView> {
    const activity = await this.activityRepo.findById(activityId);
    if (!activity) {
      throw new NotFoundException(PERMISSION_ERRORS.ACTIVITY_NOT_FOUND);
    }
    const authorized = await this.isAuthorizedForSection(
      staffId,
      personId,
      activity.sectionId,
      activity.academicYearId,
    );
    if (!authorized) {
      throw new NotFoundException(PERMISSION_ERRORS.ACTIVITY_NOT_FOUND);
    }
    return activity;
  }

  private async withStudentCount(
    activity: PermissionActivityView,
  ): Promise<PermissionActivityDto> {
    const summary = await this.requestRepo.summarizeByActivityId(activity.id);
    return { ...activity, studentCount: summary.total };
  }

  // ---- Create -----------------------------------------------------------------------

  async create(
    actor: AuthenticatedUser,
    dto: CreatePermissionActivityDto,
  ): Promise<PermissionActivityDto> {
    const staff = await this.requireActiveFaculty(actor);

    const section = await this.sectionRepo.findById(dto.sectionId);
    if (!section || section.academicYearId !== dto.academicYearId) {
      throw new NotFoundException(PERMISSION_ERRORS.SECTION_NOT_FOUND);
    }

    // Same 404-not-403 shape as an existing-resource check -- a section this
    // faculty has no live relationship to reveals nothing about whether it exists.
    const authorized = await this.isAuthorizedForSection(
      staff.id,
      actor.personId,
      dto.sectionId,
      dto.academicYearId,
    );
    if (!authorized) {
      throw new NotFoundException(PERMISSION_ERRORS.SECTION_NOT_FOUND);
    }

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException(PERMISSION_ERRORS.INVALID_TIME_RANGE);
    }
    if (dto.responseDeadline > dto.activityDate) {
      throw new BadRequestException(PERMISSION_ERRORS.INVALID_DEADLINE);
    }

    const studentIds = await this.resolveStudentIds(dto);

    const { activity } = await this.unitOfWork.run(async (client) => {
      const created = await this.activityRepo.create(
        {
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          createdByStaffId: staff.id,
          title: dto.title,
          description: dto.description ?? null,
          permissionType: dto.permissionType,
          activityDate: dto.activityDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          responseDeadline: dto.responseDeadline,
        },
        client,
      );
      await this.requestRepo.createMany(created.id, studentIds, client);
      return { activity: created };
    });

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'PERMISSION_ACTIVITY_CREATED',
      objectType: 'permission_activity',
      objectId: activity.id,
      outcome: 'SUCCESS',
      afterData: { ...activity, studentCount: studentIds.length },
    });

    return { ...activity, studentCount: studentIds.length };
  }

  /** "All students" is always resolved server-side from the live roster -- never
   * client-supplied. An explicit selection is independently re-validated per id
   * against this exact (section, academic_year); any id that fails rejects the
   * whole request rather than silently dropping a student. */
  private async resolveStudentIds(
    dto: CreatePermissionActivityDto,
  ): Promise<string[]> {
    if (dto.allStudents) {
      const enrolled =
        await this.studentEnrolmentRepo.findActiveStudentsInSection(
          dto.sectionId,
          dto.academicYearId,
        );
      if (enrolled.length === 0) {
        throw new BadRequestException(PERMISSION_ERRORS.NO_ELIGIBLE_STUDENTS);
      }
      return enrolled.map((s) => s.studentId);
    }

    const studentIds = dto.studentIds ?? [];
    const checks = await Promise.all(
      studentIds.map((id) =>
        this.studentEnrolmentRepo.isActivelyEnrolled(
          id,
          dto.sectionId,
          dto.academicYearId,
        ),
      ),
    );
    if (checks.some((ok) => !ok)) {
      throw new BadRequestException(PERMISSION_ERRORS.STUDENT_NOT_ELIGIBLE);
    }
    return studentIds;
  }

  // ---- List / detail ------------------------------------------------------------------

  async list(actor: AuthenticatedUser): Promise<PermissionActivityDto[]> {
    const staff = await this.requireActiveFaculty(actor);
    const sections = await this.getAuthorizedSections(staff.id, actor.personId);
    const activities = await this.activityRepo.listBySectionYearPairs(sections);
    return Promise.all(activities.map((a) => this.withStudentCount(a)));
  }

  /** Feeds the "Post request" form's section/grade picker -- the faculty's own
   * currently-authorized sections (teaching + class-advisor, deduplicated), never
   * a client-supplied list. */
  async listMySections(actor: AuthenticatedUser): Promise<FacultySectionDto[]> {
    const staff = await this.requireActiveFaculty(actor);
    const sections = await this.getAuthorizedSections(staff.id, actor.personId);
    const details = await Promise.all(
      sections.map((s) => this.sectionRepo.findById(s.sectionId)),
    );
    const result: FacultySectionDto[] = [];
    for (const detail of details) {
      if (detail) {
        result.push({
          sectionId: detail.id,
          academicYearId: detail.academicYearId,
          gradeName: detail.gradeName,
          sectionName: detail.sectionName,
        });
      }
    }
    return result;
  }

  async detail(
    actor: AuthenticatedUser,
    activityId: string,
  ): Promise<PermissionActivityDto> {
    const staff = await this.requireActiveFaculty(actor);
    const activity = await this.getAuthorizedActivityOrThrow(
      staff.id,
      actor.personId,
      activityId,
    );
    return this.withStudentCount(activity);
  }

  // ---- Update -------------------------------------------------------------------------

  async update(
    actor: AuthenticatedUser,
    activityId: string,
    dto: UpdatePermissionActivityDto,
  ): Promise<PermissionActivityDto> {
    const staff = await this.requireActiveFaculty(actor);
    const existing = await this.getAuthorizedActivityOrThrow(
      staff.id,
      actor.personId,
      activityId,
    );

    if (existing.status === 'CANCELLED') {
      throw new ConflictException(PERMISSION_ERRORS.ACTIVITY_ALREADY_CANCELLED);
    }

    const nextStart = dto.startTime ?? existing.startTime;
    const nextEnd = dto.endTime ?? existing.endTime;
    if (nextStart >= nextEnd) {
      throw new BadRequestException(PERMISSION_ERRORS.INVALID_TIME_RANGE);
    }
    const nextDate = dto.activityDate ?? existing.activityDate;
    const nextDeadline = dto.responseDeadline ?? existing.responseDeadline;
    if (nextDeadline > nextDate) {
      throw new BadRequestException(PERMISSION_ERRORS.INVALID_DEADLINE);
    }

    const updated = await this.unitOfWork.run(async (client) => {
      await this.activityRepo.update(activityId, dto, client);
      const view = await this.activityRepo.findById(activityId, client);
      if (!view)
        throw new NotFoundException(PERMISSION_ERRORS.ACTIVITY_NOT_FOUND);
      return view;
    });

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'PERMISSION_ACTIVITY_UPDATED',
      objectType: 'permission_activity',
      objectId: activityId,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });

    return this.withStudentCount(updated);
  }

  // ---- Cancel -------------------------------------------------------------------------

  async cancel(
    actor: AuthenticatedUser,
    activityId: string,
  ): Promise<PermissionActivityDto> {
    const staff = await this.requireActiveFaculty(actor);
    await this.getAuthorizedActivityOrThrow(
      staff.id,
      actor.personId,
      activityId,
    );

    const cancelled = await this.unitOfWork.run(async (client) => {
      const didCancel = await this.activityRepo.cancel(
        activityId,
        actor.personId,
        client,
      );
      if (!didCancel) return null;
      await this.requestRepo.cancelPendingByActivityId(activityId, client);
      return this.activityRepo.findById(activityId, client);
    });

    if (!cancelled) {
      throw new ConflictException(PERMISSION_ERRORS.ACTIVITY_ALREADY_CANCELLED);
    }

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'PERMISSION_ACTIVITY_CANCELLED',
      objectType: 'permission_activity',
      objectId: activityId,
      outcome: 'SUCCESS',
      afterData: cancelled,
    });

    return this.withStudentCount(cancelled);
  }

  // ---- Status summary -----------------------------------------------------------------

  async status(
    actor: AuthenticatedUser,
    activityId: string,
  ): Promise<StatusSummary> {
    const staff = await this.requireActiveFaculty(actor);
    const activity = await this.getAuthorizedActivityOrThrow(
      staff.id,
      actor.personId,
      activityId,
    );

    const requests = await this.requestRepo.findByActivityId(activityId);
    const summary: StatusSummary = {
      total: 0,
      consented: 0,
      declined: 0,
      pending: 0,
      expired: 0,
      cancelled: 0,
    };
    for (const request of requests) {
      const status = effectiveStatus(request.status, activity.responseDeadline);
      summary.total += 1;
      if (status === 'CONSENTED') summary.consented += 1;
      else if (status === 'DECLINED') summary.declined += 1;
      else if (status === 'PENDING') summary.pending += 1;
      else if (status === 'EXPIRED') summary.expired += 1;
      else if (status === 'CANCELLED') summary.cancelled += 1;
    }
    return summary;
  }

  // ---- Per-student breakdown ("History" detail: who responded) -----------------------

  /** For the Faculty "History" detail view -- which parent responded for each
   * student, and how. `responderName` resolves the ACTUAL responding guardian's
   * display name (never a generic "a parent"), left null while still PENDING. */
  async listStudentRequests(
    actor: AuthenticatedUser,
    activityId: string,
  ): Promise<StudentRequestSummaryDto[]> {
    const staff = await this.requireActiveFaculty(actor);
    await this.getAuthorizedActivityOrThrow(
      staff.id,
      actor.personId,
      activityId,
    );

    const requests = await this.requestRepo.findByActivityId(activityId);
    return Promise.all(
      requests.map(async (request) => {
        const responder = request.respondedByPersonId
          ? await this.personRepo.findDisplayName(request.respondedByPersonId)
          : null;
        return {
          requestId: request.id,
          studentId: request.studentId,
          studentName:
            `${request.studentFirstName} ${request.studentLastName}`.trim(),
          status: effectiveStatus(request.status, request.responseDeadline),
          responderName: responder
            ? responder.displayName?.trim() ||
              `${responder.firstName} ${responder.lastName}`.trim()
            : null,
          signedAt: request.signedAt,
          declineReason: request.declineReason,
        };
      }),
    );
  }
}
