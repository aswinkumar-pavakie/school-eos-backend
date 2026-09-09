// HR Payroll request -- Principal then Finance must both approve (both
// approval UIs out of scope); the generic engine's own "onApproved only at
// the final step" rule (see ApprovalsService.approve's isFinal check) is what
// actually enforces "only visible/actionable after Finance approval" here --
// nothing bespoke needed for that gating.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { ApprovalStepRepository } from '../approvals/repositories/approval-step.repository';
import { getApprovalTrail } from './approval-trail.util';
import { CreateStaffHrRequestDto } from './dto/create-staff-hr-request.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StaffHrRequestRepository } from './repositories/staff-hr-request.repository';

@Injectable()
export class FacultyHrRequestsService {
  constructor(
    private readonly hrRequestRepo: StaffHrRequestRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly stepRepo: ApprovalStepRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    const requests = await this.hrRequestRepo.findByStaffId(staffId);
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
    const request = await this.hrRequestRepo.findById(id);
    if (!request || !staffId || request.staffId !== staffId)
      throw new NotFoundException('Request not found');
    return {
      ...request,
      approvalTrail: await getApprovalTrail(
        this.stepRepo,
        request.approvalRequestId,
      ),
    };
  }

  async create(personId: string, dto: CreateStaffHrRequestDto) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId)
      throw new ForbiddenException('No active staff record for this account.');

    return this.unitOfWork.run(async (client) => {
      const request = await this.hrRequestRepo.create(
        {
          staffId,
          category: dto.category,
          subject: dto.subject,
          description: dto.description ?? null,
          attachmentObjectKey: dto.attachmentObjectKey ?? null,
          attachmentFileName: dto.attachmentFileName ?? null,
        },
        client,
      );
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'STAFF_HR_REQUEST',
          subjectObjectType: 'staff_hr_request',
          subjectObjectId: request.id,
          requestedBy: personId,
          payload: { category: dto.category, subject: dto.subject },
        },
        client,
      );
      await this.hrRequestRepo.linkApprovalRequest(
        request.id,
        approvalRequest.id,
        client,
      );
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'STAFF_HR_REQUEST_CREATED',
          objectType: 'staff_hr_request',
          objectId: request.id,
          outcome: 'SUCCESS',
          afterData: dto,
        },
        client,
      );
      return { ...request, approvalRequestId: approvalRequest.id };
    });
  }
}
