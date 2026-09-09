import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateStaffLeaveDto } from './dto/create-staff-leave.dto';
import { isCheckViolation } from './pg-error.util';
import { StaffLeaveRequestRepository } from './repositories/staff-leave-request.repository';

// The caller's OWN leave requests only -- staffId is always resolved by the
// controller from the authenticated actor's own personId
// (staffService.getMine), never client-supplied, so every method here is
// implicitly self-scoped by construction.
@Injectable()
export class StaffLeaveService {
  constructor(
    private readonly leaveRepo: StaffLeaveRequestRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(staffId: string) {
    return this.leaveRepo.findByStaffId(staffId);
  }

  /** Ownership-checked: a leave request that isn't the caller's own staffId
   * is a 404, not a 403 -- same "don't confirm another employee's record
   * exists" posture as every other self-scoped lookup this app already uses. */
  async get(id: string, staffId: string) {
    const leave = await this.leaveRepo.findById(id);
    if (!leave || leave.staffId !== staffId) throw new NotFoundException('Leave request not found');
    return leave;
  }

  /** Own approval trail, via the SAME assertCallerMayView the generic engine
   * already enforces on GET /approvals/:id (allows the requester themselves,
   * which the caller always is here since leave requests are only ever
   * created with requestedBy = the caller's own personId). */
  async getApprovalTrail(approvalRequestId: string, actor: AuthenticatedUser) {
    return this.approvalsService.getById(approvalRequestId, actor);
  }

  async create(staffId: string, dto: CreateStaffLeaveDto, actor: AuthenticatedUser) {
    try {
      return await this.unitOfWork.run(async (client) => {
        const created = await this.leaveRepo.create(
          { staffId, leaveType: dto.leaveType, fromDate: dto.fromDate, toDate: dto.toDate, reason: dto.reason },
          client,
        );
        const approvalRequest = await this.approvalsService.createRequest(
          {
            requestType: 'STAFF_LEAVE_REQUEST',
            subjectObjectType: 'staff_leave_request',
            subjectObjectId: created.id,
            requestedBy: actor.personId,
            payload: { leaveType: dto.leaveType, fromDate: dto.fromDate, toDate: dto.toDate },
          },
          client,
        );
        const leave = await this.leaveRepo.findById(created.id, client);
        return { ...leave!, approvalRequestId: approvalRequest.id, approvalState: approvalRequest.state };
      });
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException('toDate must be on or after fromDate.');
      }
      throw err;
    }
  }

  /** Cancellation reuses the generic engine's own withdraw() unchanged --
   * requester-only, still-open-only, already enforced there. Nothing about
   * staff_leave_request itself needs a parallel cancel path; the caller
   * (controller) resolves the leave's own approvalRequestId and calls
   * ApprovalsService.withdraw directly. This method exists only to verify
   * the leave row itself belongs to the caller before revealing its
   * approvalRequestId to withdraw against. */
  async assertOwnLeave(id: string, staffId: string) {
    const leave = await this.get(id, staffId);
    if (!leave.approvalRequestId) {
      throw new BadRequestException('This leave request has no associated approval to withdraw.');
    }
    return leave;
  }
}
