// Parent-initiated Gate Pass and Emergency Exit requests. Same authorization
// boundary as parent-permissions/parent-fees: @Roles('PARENT') only proves "this
// caller is *a* parent" -- every call re-checks a real, ACTIVE guardian_link between
// the caller and the exact student named, via GuardianLinkRepository.findActiveLink
// (this module's own established pattern), before creating anything on their behalf.
//
// A brand-new outing_request is created, then handed to the generic approvals engine
// (ApprovalsService.createRequest) with payload.approverScope pointed at the
// student's current hostel -- so only that hostel's Warden(s) can ever decide it (see
// ApproverAssignmentRepository.personHoldsRole in the approvals module). Both writes
// are one transaction: a request with no linked approval_request should never be
// observable.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PARENT_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  EMERGENCY_EXIT_REQUEST_TYPE,
  GATE_PASS_REQUEST_TYPE,
  OutingRequestRepository,
} from '../hostel-warden/repositories/outing-request.repository';
import { StudentHostelRepository } from '../hostel-warden/repositories/student-hostel.repository';
import { CreateEmergencyExitRequestDto } from './dto/create-emergency-exit-request.dto';
import { CreateGatePassRequestDto } from './dto/create-gate-pass-request.dto';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';

const NOT_A_HOSTELLER =
  'This student does not currently have an active hostel room allocation';

@Injectable()
export class ParentHostelRequestsService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly outingRequestRepo: OutingRequestRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  private async assertActiveGuardian(
    personId: string,
    studentId: string,
  ): Promise<void> {
    const link = await this.guardianLinkRepo.findActiveLink(
      personId,
      studentId,
    );
    if (!link) throw new NotFoundException(PARENT_ERRORS.NOT_LINKED_TO_STUDENT);
  }

  private async createOutingRequest(
    requestType: string,
    input: {
      studentId: string;
      outFrom: string;
      expectedReturn: string;
      reason: string;
      destination?: string | null;
      isOvernight?: boolean;
    },
    personId: string,
    auditAction: string,
  ) {
    await this.assertActiveGuardian(personId, input.studentId);

    // Same rule the DB's own `outing_times` CHECK enforces (expected_return >
    // out_from) -- caught here first so a mis-picked date shows a real
    // validation message, not a raw constraint-violation 500.
    if (new Date(input.expectedReturn) <= new Date(input.outFrom)) {
      throw new BadRequestException(PARENT_ERRORS.INVALID_OUTING_TIMES);
    }

    const hostelId = await this.studentHostelRepo.findCurrentHostelIdForStudent(
      input.studentId,
    );
    if (!hostelId) throw new ForbiddenException(NOT_A_HOSTELLER);

    return this.unitOfWork.run(async (client) => {
      const request = await this.outingRequestRepo.create(
        {
          studentId: input.studentId,
          requestedBy: personId,
          outFrom: new Date(input.outFrom),
          expectedReturn: new Date(input.expectedReturn),
          isOvernight: input.isOvernight,
          reason: input.reason,
          destination: input.destination,
        },
        client,
      );

      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType,
          subjectObjectType: 'outing_request',
          subjectObjectId: request.id,
          requestedBy: personId,
          payload: {
            approverScope: { scopeType: 'HOSTEL', scopeId: hostelId },
          },
        },
        client,
      );
      await this.outingRequestRepo.attachApprovalRequest(
        request.id,
        approvalRequest.id,
        client,
      );

      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'PARENT',
          action: auditAction,
          objectType: 'outing_request',
          objectId: request.id,
          outcome: 'SUCCESS',
          afterData: { studentId: input.studentId, requestType },
        },
        client,
      );

      return (await this.outingRequestRepo.findById(request.id, client))!;
    });
  }

  async createGatePassRequest(dto: CreateGatePassRequestDto, personId: string) {
    return this.createOutingRequest(
      GATE_PASS_REQUEST_TYPE,
      dto,
      personId,
      'HOSTEL_GATE_PASS_REQUEST_CREATED',
    );
  }

  async createEmergencyExitRequest(
    dto: CreateEmergencyExitRequestDto,
    personId: string,
  ) {
    return this.createOutingRequest(
      EMERGENCY_EXIT_REQUEST_TYPE,
      dto,
      personId,
      'HOSTEL_EMERGENCY_EXIT_REQUEST_CREATED',
    );
  }

  async list(personId: string, requestType: string) {
    // A parent's own request history -- the generic approvals engine already answers
    // "requests I raised" via listForCaller, scoped to requestedBy === actor, which is
    // exactly the parent-safety boundary needed here (no cross-parent leakage risk the
    // way the Warden-side listing had, since this is never scoped by hostel/role).
    return this.outingRequestRepo.findManyForRequester(personId, requestType);
  }
}
