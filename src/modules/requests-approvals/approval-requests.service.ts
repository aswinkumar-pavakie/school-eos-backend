import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalRequestQueryDto } from './dto/approval-request-query.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalRequestDto } from './dto/decide-approval-request.dto';
import { ResubmitApprovalRequestDto } from './dto/resubmit-approval-request.dto';
import { SendBackApprovalRequestDto } from './dto/send-back-approval-request.dto';
import { RequestEffectsService } from './request-effects.service';
import { ApprovalRequestRepository } from './repositories/approval-request.repository';
import { ApprovalStepRepository } from './repositories/approval-step.repository';

const OPEN_STATES = ['PENDING', 'RESUBMITTED'];

@Injectable()
export class ApprovalRequestsService {
  constructor(
    private readonly requestRepo: ApprovalRequestRepository,
    private readonly stepRepo: ApprovalStepRepository,
    private readonly requestEffects: RequestEffectsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ApprovalRequestQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const viewFilter: { state?: string; states?: string[] } =
      query.view === 'pending'
        ? { states: ['PENDING', 'RESUBMITTED'] }
        : query.view === 'approved'
          ? { state: 'APPROVED' }
          : query.view === 'rejected'
            ? { state: 'REJECTED' }
            : query.view === 'sent_back'
              ? { state: 'SENT_BACK' }
              : {}; // 'history' (or no view) -- every state
    const { rows, total } = await this.requestRepo.findMany({
      requestType: query.requestType,
      search: query.search,
      limit,
      offset: (page - 1) * limit,
      ...viewFilter,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const request = await this.requestRepo.findById(id);
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  async create(dto: CreateApprovalRequestDto, actorPersonId: string) {
    const approverRoleCode = await this.requestRepo.findFirstStepApproverRole(
      dto.requestType,
    );
    if (approverRoleCode !== 'ADMIN') {
      throw new ForbiddenException(
        `"${dto.requestType}" isn't an Admin approval -- it's routed to ${approverRoleCode ?? 'a role with no active policy'}.`,
      );
    }

    return this.unitOfWork.run(async (client) => {
      const created = await this.requestRepo.create(
        {
          requestType: dto.requestType,
          subjectObjectType: dto.subjectObjectType,
          subjectObjectId: dto.subjectObjectId,
          requestedBy: dto.requestedByPersonId ?? actorPersonId,
          payload: {
            description: dto.description,
            reason: dto.reason ?? null,
            ...dto.actionPayload,
          },
        },
        client,
      );
      await this.stepRepo.create(created.id, 1, approverRoleCode, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'APPROVAL_REQUEST_CREATED',
          objectType: 'approval_request',
          objectId: created.id,
          outcome: 'SUCCESS',
          afterData: created,
        },
        client,
      );
      return (await this.requestRepo.findById(created.id, client))!;
    });
  }

  /** Applying the real effect (attendance correction, person activation, role
   * grant, student field update, inventory issue/transfer, repair-request
   * creation) happens through each domain's own service, each of which owns
   * its own transaction -- so this can't be one single atomic DB transaction
   * spanning both "mark approved" and "apply effect" without a much larger
   * refactor of every one of those existing services. Trade-off accepted:
   * the effect runs first, and the request is only marked APPROVED once it
   * actually succeeds -- so a request can never show APPROVED while the real
   * record was left unchanged. Two admins approving the exact same request in
   * the same instant (unlikely for a single-operator queue) could both pass
   * the initial state check; this is a low-severity, low-likelihood residual
   * race, deliberately not solved with cross-connection locking here. */
  async approve(
    id: string,
    dto: DecideApprovalRequestDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(id);
    if (!OPEN_STATES.includes(existing.state)) {
      throw new ConflictException(
        `This request is already ${existing.state.toLowerCase()}.`,
      );
    }
    if (existing.approverRoleCode !== 'ADMIN') {
      throw new ForbiddenException("This request isn't Admin's to approve.");
    }

    const effectResult = await this.requestEffects.apply(
      existing,
      actorPersonId,
    );

    return this.unitOfWork.run(async (client) => {
      await this.stepRepo.decide(
        id,
        existing.currentStep,
        'APPROVED',
        actorPersonId,
        dto.comment ?? null,
        client,
      );
      if (effectResult)
        await this.requestRepo.mergePayload(id, { effectResult }, client);
      await this.requestRepo.setState(id, 'APPROVED', client, new Date());
      const updated = (await this.requestRepo.findById(id, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'APPROVAL_REQUEST_APPROVED',
          objectType: 'approval_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: existing,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  async reject(
    id: string,
    dto: DecideApprovalRequestDto,
    actorPersonId: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.requestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Request not found');
      if (!OPEN_STATES.includes(locked.state)) {
        throw new ConflictException(
          `This request is already ${locked.state.toLowerCase()}.`,
        );
      }
      await this.stepRepo.decide(
        id,
        locked.currentStep,
        'REJECTED',
        actorPersonId,
        dto.comment ?? null,
        client,
      );
      await this.requestRepo.setState(id, 'REJECTED', client, new Date());
      const updated = (await this.requestRepo.findById(id, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'APPROVAL_REQUEST_REJECTED',
          objectType: 'approval_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  /** Not a step decision (approval_step.decision only ever holds
   * APPROVED/REJECTED) -- just a status transition, so the requester knows to
   * fix something and resubmit. Recorded on the audit trail like everything
   * else here. */
  async sendBack(
    id: string,
    dto: SendBackApprovalRequestDto,
    actorPersonId: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.requestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Request not found');
      if (!OPEN_STATES.includes(locked.state)) {
        throw new ConflictException(
          `This request is already ${locked.state.toLowerCase()}.`,
        );
      }
      await this.requestRepo.setState(id, 'SENT_BACK', client);
      const updated = (await this.requestRepo.findById(id, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'APPROVAL_REQUEST_SENT_BACK',
          objectType: 'approval_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: { ...updated, comment: dto.comment },
        },
        client,
      );
      return updated;
    });
  }

  /** Requester corrects and resubmits -- goes back to RESUBMITTED (a visibly
   * distinct flavour of "pending" so Admin can see it already came back once)
   * and is decidable exactly like a fresh PENDING request. */
  async resubmit(
    id: string,
    dto: ResubmitApprovalRequestDto,
    actorPersonId: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.requestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Request not found');
      if (locked.state !== 'SENT_BACK') {
        throw new ConflictException(
          'Only a request that was sent back can be resubmitted.',
        );
      }
      const patch: Record<string, unknown> = {};
      if (dto.description !== undefined) patch.description = dto.description;
      if (dto.reason !== undefined) patch.reason = dto.reason;
      if (dto.actionPayload) Object.assign(patch, dto.actionPayload);
      if (Object.keys(patch).length > 0)
        await this.requestRepo.mergePayload(id, patch, client);
      await this.requestRepo.setState(id, 'RESUBMITTED', client);
      const updated = (await this.requestRepo.findById(id, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'APPROVAL_REQUEST_RESUBMITTED',
          objectType: 'approval_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: { ...updated, comment: dto.comment ?? null },
        },
        client,
      );
      return updated;
    });
  }
}
