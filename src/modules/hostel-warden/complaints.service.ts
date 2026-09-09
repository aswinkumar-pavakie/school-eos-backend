import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateHostelComplaintDto } from './dto/create-hostel-complaint.dto';
import { UpdateHostelComplaintDto } from './dto/update-hostel-complaint.dto';
import {
  HostelComplaintRepository,
  HostelComplaintRow,
} from './repositories/hostel-complaint.repository';
import { WardenContextService } from './warden-context.service';

// Request type this complaint's approval_request is created with -- routed to
// PRINCIPAL via the approval_policy seed in query.md. PRINCIPAL is a single-
// holder, unscoped role (same as FEE_CONCESSION/REFUND/MEDIA_INDENT/etc.
// already routed to it), so no payload.approverScope is needed here, unlike
// the Warden-scoped HOSTEL_GATE_PASS_REQUEST/HOSTEL_EMERGENCY_EXIT_REQUEST.
export const HOSTEL_COMPLAINT_REVIEW_REQUEST_TYPE = 'HOSTEL_COMPLAINT_REVIEW';

// A terminal state has no further transitions; otherwise any non-terminal state may
// move to any other listed state -- simple enough for a Warden-driven tracker without
// inventing a full workflow engine for it.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'ESCALATED', 'REJECTED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'ESCALATED', 'CLOSED'],
  ESCALATED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
  REJECTED: [],
};

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly complaintRepo: HostelComplaintRepository,
    private readonly auditService: AuditService,
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.complaintRepo.findManyForHostels(ctx.hostelIds);
  }

  private async getScoped(
    id: string,
    hostelIds: string[],
  ): Promise<HostelComplaintRow> {
    const complaint = await this.complaintRepo.findById(id);
    if (!complaint || !hostelIds.includes(complaint.hostelId)) {
      throw new NotFoundException(HOSTEL_WARDEN_ERRORS.COMPLAINT_NOT_FOUND);
    }
    return complaint;
  }

  async get(id: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.getScoped(id, ctx.hostelIds);
  }

  /** Creates the complaint and, in the same transaction, an approval_request
   * routed to PRINCIPAL -- a complaint is a "request" from the Warden's own
   * perspective from the moment it's raised, not something the Warden self-
   * decides. Mirrors ParentHostelRequestsService's outing_request + approval_
   * request pairing exactly, just without an approverScope (see this file's
   * own note on why PRINCIPAL needs none). */
  async create(dto: CreateHostelComplaintDto, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const hostelId = ctx.hostelIds[0];

    return this.unitOfWork.run(async (client) => {
      const complaint = await this.complaintRepo.create(
        {
          hostelId,
          blockId: dto.blockId,
          roomId: dto.roomId,
          issueType: dto.issueType,
          subject: dto.subject,
          description: dto.description,
          raisedByPersonId: personId,
        },
        client,
      );

      await this.approvalsService.createRequest(
        {
          requestType: HOSTEL_COMPLAINT_REVIEW_REQUEST_TYPE,
          subjectObjectType: 'complaint',
          subjectObjectId: complaint.id,
          requestedBy: personId,
        },
        client,
      );

      await this.auditService.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'HOSTEL_WARDEN',
          action: 'HOSTEL_COMPLAINT_CREATED',
          objectType: 'complaint',
          objectId: complaint.id,
          outcome: 'SUCCESS',
          afterData: complaint,
        },
        client,
      );

      return complaint;
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateHostelComplaintDto,
    personId: string,
  ) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const complaint = await this.getScoped(id, ctx.hostelIds);

    const allowed = ALLOWED_TRANSITIONS[complaint.state] ?? [];
    if (!allowed.includes(dto.state)) {
      throw new ConflictException(
        `Cannot move a ${complaint.state} complaint to ${dto.state}.`,
      );
    }

    const updated = await this.complaintRepo.updateState(id, dto.state);

    await this.auditService.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: 'HOSTEL_COMPLAINT_STATUS_UPDATED',
      objectType: 'complaint',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: complaint,
      afterData: updated,
    });

    return updated!;
  }
}
