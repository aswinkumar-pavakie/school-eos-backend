// Employee Leave & OD -- a Faculty member's own leave/on-duty request, routed
// to the Principal via the same generic approvals engine every other
// approval-routed subject in this codebase uses. Deciding happens through the
// existing generic /approvals/:id/approve|reject endpoints (Principal's own
// approval UI is explicitly out of scope) -- see FacultyApprovalHandlers for
// what actually happens to staff_leave_request + staff_attendance_event the
// moment that decision lands.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { ApprovalStepRepository } from '../approvals/repositories/approval-step.repository';
import { getApprovalTrail } from './approval-trail.util';
import { CreateStaffLeaveDto } from './dto/create-staff-leave.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StaffLeaveRequestRepository } from './repositories/staff-leave-request.repository';

@Injectable()
export class FacultyStaffLeaveService {
  constructor(
    private readonly leaveRepo: StaffLeaveRequestRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly stepRepo: ApprovalStepRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    const requests = await this.leaveRepo.findByStaffId(staffId);
    return Promise.all(
      requests.map(async (r) => ({
        ...r,
        approvalTrail: await getApprovalTrail(
          this.stepRepo,
          r.approvalRequestId,
        ),
      })),
    );
  }

  async get(personId: string, id: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    const request = await this.leaveRepo.findById(id);
    if (!request || !staffId || request.staffId !== staffId)
      throw new NotFoundException('Leave request not found');
    return {
      ...request,
      approvalTrail: await getApprovalTrail(
        this.stepRepo,
        request.approvalRequestId,
      ),
    };
  }

  async create(personId: string, dto: CreateStaffLeaveDto) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId)
      throw new ForbiddenException('No active staff record for this account.');
    if (new Date(dto.toDate).getTime() < new Date(dto.fromDate).getTime()) {
      throw new BadRequestException('toDate must be on or after fromDate.');
    }

    return this.unitOfWork.run(async (client) => {
      const id = await this.leaveRepo.create(
        {
          staffId,
          leaveType: dto.leaveType,
          fromDate: dto.fromDate,
          toDate: dto.toDate,
          reason: dto.reason,
          attachmentObjectKey: dto.attachmentObjectKey ?? null,
          attachmentFileName: dto.attachmentFileName ?? null,
        },
        client,
      );
      await this.approvalsService.createRequest(
        {
          requestType: 'STAFF_LEAVE_REQUEST',
          subjectObjectType: 'staff_leave_request',
          subjectObjectId: id,
          requestedBy: personId,
          payload: {
            leaveType: dto.leaveType,
            fromDate: dto.fromDate,
            toDate: dto.toDate,
          },
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'STAFF_LEAVE_REQUESTED',
          objectType: 'staff_leave_request',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: dto,
        },
        client,
      );
      return this.leaveRepo.findById(id, client);
    });
  }
}
