// Faculty's own "Leave" (student leave, class-advisor side). Raising a
// request is a real Parent-app feature explicitly out of scope for this
// build (see StudentLeaveRequestRepository.create's own note) -- this service
// is the Faculty inbox (list requests for the advisor's own sections) plus
// the minimal creation path needed for the feature to have anything real to
// act on. Deciding a request happens through the existing generic
// /approvals/:id/approve|reject endpoints (same as every other approval-
// routed subject in this codebase) -- see FacultyApprovalHandlers for what
// actually happens to student_leave_request + attendance the moment that
// decision lands.

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StudentLeaveRequestRepository } from './repositories/student-leave-request.repository';

@Injectable()
export class FacultyStudentLeaveService {
  constructor(
    private readonly leaveRepo: StudentLeaveRequestRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  /** Every leave request for a student in one of this faculty member's own
   * advisor sections -- never another advisor's class. */
  async listForAdvisor(personId: string) {
    const sections = await this.scopeRepo.getAdvisorSections(personId);
    return this.leaveRepo.findBySections(sections.map((s) => s.sectionId));
  }

  async get(personId: string, id: string) {
    const request = await this.leaveRepo.findById(id);
    if (!request) throw new NotFoundException('Leave request not found');
    const isMine = await this.isRequestInAdvisorScope(
      personId,
      request.studentId,
    );
    if (!isMine) throw new NotFoundException('Leave request not found');
    return request;
  }

  private async isRequestInAdvisorScope(
    personId: string,
    studentId: string,
  ): Promise<boolean> {
    const sections = await this.scopeRepo.getAdvisorSections(personId);
    const sectionIds = new Set(sections.map((s) => s.sectionId));
    const rows = await this.leaveRepo.findBySections([...sectionIds]);
    return rows.some((r) => r.studentId === studentId);
  }

  /** Parent's own "History" tab -- every request they themselves can see for
   * this exact child, guardian-checked the same way create() below is. */
  async listForStudent(actorPersonId: string, studentId: string) {
    const isGuardian = await this.leaveRepo.isActiveGuardian(
      actorPersonId,
      studentId,
    );
    if (!isGuardian)
      throw new ForbiddenException(
        'You are not a registered guardian of this student.',
      );
    return this.leaveRepo.findByStudent(studentId);
  }

  /** Minimal creation path (see repository note) -- real ACTIVE guardian only. */
  async create(
    actorPersonId: string,
    input: {
      studentId: string;
      fromDate: string;
      toDate: string;
      reason: string;
      skipSchoolTransport?: boolean;
      attachmentObjectKey?: string;
      attachmentFileName?: string;
    },
  ) {
    if (new Date(input.toDate).getTime() < new Date(input.fromDate).getTime()) {
      throw new ConflictException('toDate must be on or after fromDate.');
    }
    const isGuardian = await this.leaveRepo.isActiveGuardian(
      actorPersonId,
      input.studentId,
    );
    if (!isGuardian)
      throw new ForbiddenException(
        'You are not a registered guardian of this student.',
      );

    return this.unitOfWork.run(async (client) => {
      const id = await this.leaveRepo.create(
        { ...input, requestedBy: actorPersonId },
        client,
      );
      await this.approvalsService.createRequest(
        {
          requestType: 'STUDENT_LEAVE_REQUEST',
          subjectObjectType: 'student_leave_request',
          subjectObjectId: id,
          requestedBy: actorPersonId,
          payload: {
            studentId: input.studentId,
            fromDate: input.fromDate,
            toDate: input.toDate,
          },
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: 'PARENT',
          action: 'STUDENT_LEAVE_REQUEST_CREATED',
          objectType: 'student_leave_request',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: input,
        },
        client,
      );
      return this.leaveRepo.findById(id, client);
    });
  }
}
