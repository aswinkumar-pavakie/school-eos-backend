// Payslip -- gated by its own request, exactly like HR Payroll: Principal
// then Finance must both approve (reusing staff_hr_request's own
// category='PAYSLIP_REQUEST', added on the same already-seeded two-step
// policy -- see 0009_faculty_module_2.sql). Real payslip data behind
// listForStaff/findOneForStaff (already real, already read-only) only
// becomes reachable once at least one such request has reached Finance's
// final APPROVED -- a one-time clearance, not a fresh request every period
// (payslip access, once granted, stays granted for every subsequent real
// payslip Finance later processes).

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
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { PayslipRepository } from './repositories/payslip.repository';
import { StaffHrRequestRepository } from './repositories/staff-hr-request.repository';

const CATEGORY = 'PAYSLIP_REQUEST';

@Injectable()
export class FacultyPayslipService {
  constructor(
    private readonly payslipRepo: PayslipRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly hrRequestRepo: StaffHrRequestRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly stepRepo: ApprovalStepRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  private async hasApprovedAccess(staffId: string): Promise<boolean> {
    const requests = await this.hrRequestRepo.findByStaffAndCategory(
      staffId,
      CATEGORY,
    );
    return requests.some((r) => r.state === 'APPROVED');
  }

  /** The request trail itself -- shown regardless of whether access has been
   * granted yet, so the faculty can see "pending with Principal" /
   * "rejected by Finance X" / etc. */
  async getRequestStatus(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return { requests: [], hasAccess: false };
    const requests = await this.hrRequestRepo.findByStaffAndCategory(
      staffId,
      CATEGORY,
    );
    const withTrail = await Promise.all(
      requests.map(async (r) => ({
        ...r,
        approvalTrail: await getApprovalTrail(
          this.stepRepo,
          r.approvalRequestId,
        ),
      })),
    );
    return {
      requests: withTrail,
      hasAccess: requests.some((r) => r.state === 'APPROVED'),
    };
  }

  async requestAccess(personId: string, note?: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId)
      throw new ForbiddenException('No active staff record for this account.');

    const existing = await this.hrRequestRepo.findByStaffAndCategory(
      staffId,
      CATEGORY,
    );
    if (existing.some((r) => r.state === 'PENDING')) {
      throw new ForbiddenException(
        'You already have a pending payslip access request.',
      );
    }

    return this.unitOfWork.run(async (client) => {
      const request = await this.hrRequestRepo.create(
        {
          staffId,
          category: CATEGORY,
          subject: 'Payslip access request',
          description: note ?? null,
          attachmentObjectKey: null,
          attachmentFileName: null,
        },
        client,
      );
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'STAFF_HR_REQUEST',
          subjectObjectType: 'staff_hr_request',
          subjectObjectId: request.id,
          requestedBy: personId,
          payload: { category: CATEGORY },
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
          action: 'PAYSLIP_ACCESS_REQUESTED',
          objectType: 'staff_hr_request',
          objectId: request.id,
          outcome: 'SUCCESS',
        },
        client,
      );
      return { ...request, approvalRequestId: approvalRequest.id };
    });
  }

  async list(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    if (!(await this.hasApprovedAccess(staffId))) return [];
    return this.payslipRepo.findForStaff(staffId);
  }

  async get(personId: string, id: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId || !(await this.hasApprovedAccess(staffId)))
      throw new NotFoundException('Payslip not found');
    const payslip = await this.payslipRepo.findOneForStaff(staffId, id);
    if (!payslip) throw new NotFoundException('Payslip not found');
    return payslip;
  }
}
