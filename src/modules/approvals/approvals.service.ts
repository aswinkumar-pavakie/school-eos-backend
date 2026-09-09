// The generic approvals engine — Feature 1. Every other module that needs sign-off
// (Finance's refunds/concessions/fee-structure-activation/vendor-settlements today;
// Hostel/Academics/Payroll later) calls `createRequest` in-process, inside its own
// UnitOfWork transaction, and registers a SubjectStateHandler for its subject_object_type
// so this engine can flip that object's state atomically with the decision itself.

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { APPROVALS_ERRORS } from '../../common/errors/error-codes';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import type { Queryable } from '../../infrastructure/postgres/postgres.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalPolicyRepository } from './repositories/approval-policy.repository';
import {
  ApprovalRequestRepository,
  ApprovalRequestRow,
  CreateApprovalRequestInput,
} from './repositories/approval-request.repository';
import {
  ApprovalStepRepository,
  ApprovalStepRow,
} from './repositories/approval-step.repository';
import {
  ApproverAssignmentRepository,
  ApproverScope,
} from './repositories/approver-assignment.repository';
import { SubjectStateRegistry } from './subject-state.registry';

const OPEN_STATES = ['PENDING', 'RETROSPECTIVE_PENDING'];
const DECIDED_STATES = ['APPROVED', 'REJECTED'];

export interface ApprovalRequestWithSteps {
  request: ApprovalRequestRow;
  steps: ApprovalStepRow[];
}

function approverScopeFromPayload(
  payload: Record<string, unknown>,
): ApproverScope | null {
  const scope = payload.approverScope as
    { scopeType?: string; scopeId?: string } | undefined;
  if (!scope || !scope.scopeType || !scope.scopeId) return null;
  return { scopeType: scope.scopeType, scopeId: scope.scopeId };
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly approvalRequestRepo: ApprovalRequestRepository,
    private readonly approvalStepRepo: ApprovalStepRepository,
    private readonly approvalPolicyRepo: ApprovalPolicyRepository,
    private readonly approverAssignmentRepo: ApproverAssignmentRepository,
    private readonly subjectStateRegistry: SubjectStateRegistry,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * Creates a request and its full step chain from the seeded approval_policy. Callers
   * that already hold a transaction (e.g. Finance creating a refund) MUST pass their
   * own `executor` so the subject write and the approval request are one commit.
   */
  async createRequest(
    input: Omit<CreateApprovalRequestInput, 'initialState'> & {
      isRetrospective?: boolean;
    },
    executor: Queryable,
  ): Promise<ApprovalRequestRow> {
    const steps = await this.approvalPolicyRepo.resolveStepChain(
      input.requestType,
      input.amountPaise ?? null,
      executor,
    );
    if (steps.length === 0) {
      throw new ConflictException(APPROVALS_ERRORS.NO_POLICY_FOR_REQUEST_TYPE);
    }

    const firstStep = steps[0];
    const dueAt = firstStep.slaHours
      ? new Date(Date.now() + firstStep.slaHours * 60 * 60 * 1000)
      : null;

    const request = await this.approvalRequestRepo.create(
      {
        ...input,
        dueAt,
        initialState:
          input.isRetrospective || firstStep.isRetrospective
            ? 'RETROSPECTIVE_PENDING'
            : 'PENDING',
      },
      executor,
    );

    await this.approvalStepRepo.createMany(
      request.id,
      steps.map((s) => ({
        sequenceNo: s.sequenceNo,
        approverRoleCode: s.approverRoleCode,
      })),
      executor,
    );

    return request;
  }

  /** Lets an owning feature check whether a request it created is still open, without needing its own repository over approval_request. */
  async getState(id: string): Promise<string | null> {
    const request = await this.approvalRequestRepo.findById(id);
    return request?.state ?? null;
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ApprovalRequestWithSteps> {
    const request = await this.approvalRequestRepo.findById(id);
    if (!request)
      throw new NotFoundException(APPROVALS_ERRORS.REQUEST_NOT_FOUND);
    await this.assertCallerMayView(request, actor);
    const steps = await this.approvalStepRepo.listByRequest(id);
    return { request, steps };
  }

  async listForCaller(
    actor: AuthenticatedUser,
    filter: {
      requestType?: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    },
  ): Promise<ApprovalRequestRow[]> {
    const status = filter.status ?? 'PENDING';
    const forHistory = status !== 'PENDING';
    const states = status === 'PENDING' ? OPEN_STATES : [status];
    return this.approvalRequestRepo.listForCaller(
      actor.personId,
      actor.roles,
      forHistory,
      {
        requestType: filter.requestType,
        states,
      },
    );
  }

  /** The requester withdraws their own still-open request — a real, distinct terminal state (CANCELLED), not a REJECTED decision by an approver. */
  async withdraw(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ApprovalRequestRow> {
    return this.unitOfWork.run(async (client) => {
      const request = await this.approvalRequestRepo.findByIdForUpdate(
        id,
        client,
      );
      if (!request)
        throw new NotFoundException(APPROVALS_ERRORS.REQUEST_NOT_FOUND);
      if (!OPEN_STATES.includes(request.state)) {
        throw new ConflictException(APPROVALS_ERRORS.NOT_PENDING);
      }
      if (request.requestedBy !== actor.personId) {
        throw new ForbiddenException(
          'Only the person who raised this request can withdraw it',
        );
      }
      await this.approvalRequestRepo.markCancelled(id, client);
      const handler = this.subjectStateRegistry.get(request.subjectObjectType);
      await handler?.onWithdrawn?.(request.subjectObjectId, client);
      return { ...request, state: 'CANCELLED' };
    });
  }

  async approve(
    id: string,
    actor: AuthenticatedUser,
    comment: string | undefined,
  ): Promise<ApprovalRequestWithSteps> {
    return this.decide(id, actor, 'APPROVED', comment ?? null);
  }

  async reject(
    id: string,
    actor: AuthenticatedUser,
    comment: string,
  ): Promise<ApprovalRequestWithSteps> {
    return this.decide(id, actor, 'REJECTED', comment);
  }

  /** Not a final decision -- returns the request to the requester for revision
   * rather than approving/rejecting it. Same authorization boundary as
   * approve/reject (must hold the current step's approver role, can't act on your
   * own request), but doesn't record a step decision or flip the subject to a
   * terminal state -- see approval-request.repository.ts's markSentBack for why. */
  async sendBack(
    id: string,
    actor: AuthenticatedUser,
    comment: string,
  ): Promise<ApprovalRequestWithSteps> {
    return this.unitOfWork.run(async (client) => {
      const request = await this.approvalRequestRepo.findByIdForUpdate(id, client);
      if (!request) throw new NotFoundException(APPROVALS_ERRORS.REQUEST_NOT_FOUND);
      if (!OPEN_STATES.includes(request.state)) {
        throw new ConflictException(APPROVALS_ERRORS.NOT_PENDING);
      }

      const step = await this.approvalStepRepo.findByRequestAndSequence(
        id,
        request.currentStep,
        client,
      );
      if (!step || step.decision) {
        throw new ConflictException(APPROVALS_ERRORS.NOT_PENDING);
      }

      if (request.requestedBy === actor.personId) {
        throw new ForbiddenException('You cannot decide a request you raised yourself');
      }

      const scope = approverScopeFromPayload(request.payload);
      const authorized = await this.approverAssignmentRepo.personHoldsRole(
        actor.personId,
        step.approverRoleCode,
        scope,
        client,
      );
      if (!authorized) {
        throw new ForbiddenException(APPROVALS_ERRORS.STEP_NOT_ASSIGNED_TO_CALLER);
      }

      await this.approvalRequestRepo.markSentBack(id, client);

      const handler = this.subjectStateRegistry.get(request.subjectObjectType);
      await handler?.onSentBack?.(request.subjectObjectId, client);

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: step.approverRoleCode,
          action: 'APPROVAL_SENT_BACK',
          objectType: 'approval_request',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { comment },
        },
        client,
      );

      await this.outbox.enqueue(
        {
          personId: request.requestedBy,
          notificationType: 'APPROVAL_SENT_BACK',
          title: 'Your request was sent back',
          body: `${request.requestType.replace(/_/g, ' ')} — sent back: ${comment}`,
          relatedObjectType: 'approval_request',
          relatedObjectId: id,
        },
        client,
      );

      const refreshedRequest = await this.approvalRequestRepo.findById(id, client);
      const steps = await this.approvalStepRepo.listByRequest(id, client);
      return { request: refreshedRequest!, steps };
    });
  }

  private async decide(
    id: string,
    actor: AuthenticatedUser,
    decision: 'APPROVED' | 'REJECTED',
    comment: string | null,
  ): Promise<ApprovalRequestWithSteps> {
    return this.unitOfWork.run(async (client) => {
      const request = await this.approvalRequestRepo.findByIdForUpdate(
        id,
        client,
      );
      if (!request)
        throw new NotFoundException(APPROVALS_ERRORS.REQUEST_NOT_FOUND);
      if (!OPEN_STATES.includes(request.state)) {
        throw new ConflictException(APPROVALS_ERRORS.NOT_PENDING);
      }

      const step = await this.approvalStepRepo.findByRequestAndSequence(
        id,
        request.currentStep,
        client,
      );
      if (!step || step.decision) {
        throw new ConflictException(APPROVALS_ERRORS.NOT_PENDING);
      }

      // The one rule that never bends anywhere in the system: nobody can approve
      // their own request — checked here, once, for every request type, rather than
      // trusted to each feature's own policy rows to get right.
      if (request.requestedBy === actor.personId) {
        throw new ForbiddenException(
          'You cannot decide a request you raised yourself',
        );
      }

      const scope = approverScopeFromPayload(request.payload);
      const authorized = await this.approverAssignmentRepo.personHoldsRole(
        actor.personId,
        step.approverRoleCode,
        scope,
        client,
      );
      if (!authorized) {
        throw new ForbiddenException(
          APPROVALS_ERRORS.STEP_NOT_ASSIGNED_TO_CALLER,
        );
      }

      await this.approvalStepRepo.recordDecision(
        step.id,
        actor.personId,
        decision,
        comment,
        client,
      );

      if (decision === 'REJECTED') {
        await this.approvalRequestRepo.markDecided(id, 'REJECTED', client);
        await this.applySubjectTransition(
          request,
          'REJECTED',
          client,
          actor.personId,
        );
      } else {
        const isFinal = !(await this.approvalStepRepo.hasNextStep(
          id,
          request.currentStep,
          client,
        ));
        if (isFinal) {
          await this.approvalRequestRepo.markDecided(id, 'APPROVED', client);
          await this.applySubjectTransition(
            request,
            'APPROVED',
            client,
            actor.personId,
          );
        } else {
          await this.approvalRequestRepo.advanceToNextStep(id, client);
        }
      }

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: step.approverRoleCode,
          action: `APPROVAL_${decision}`,
          objectType: 'approval_request',
          objectId: id,
          // audit_event.outcome is DB-constrained to SUCCESS/DENIED/ERROR — the actual
          // business decision (APPROVED/REJECTED) lives in the action name + afterData.
          outcome: decision === 'APPROVED' ? 'SUCCESS' : 'DENIED',
          afterData: { decision, comment },
        },
        client,
      );

      await this.outbox.enqueue(
        {
          personId: request.requestedBy,
          notificationType: `APPROVAL_${decision}`,
          title:
            decision === 'APPROVED'
              ? 'Your request was approved'
              : 'Your request was rejected',
          body: `${request.requestType.replace(/_/g, ' ')} — ${decision.toLowerCase()}${comment ? `: ${comment}` : ''}`,
          relatedObjectType: 'approval_request',
          relatedObjectId: id,
        },
        client,
      );

      const refreshedRequest = await this.approvalRequestRepo.findById(
        id,
        client,
      );
      const steps = await this.approvalStepRepo.listByRequest(id, client);
      return { request: refreshedRequest!, steps };
    });
  }

  private async applySubjectTransition(
    request: ApprovalRequestRow,
    decision: 'APPROVED' | 'REJECTED',
    client: Queryable,
    decidedBy: string,
  ): Promise<void> {
    const handler = this.subjectStateRegistry.get(request.subjectObjectType);
    if (!handler) {
      throw new ConflictException(APPROVALS_ERRORS.UNSUPPORTED_SUBJECT_TYPE);
    }
    if (decision === 'APPROVED') {
      await handler.onApproved(request.subjectObjectId, client, decidedBy);
    } else {
      await handler.onRejected(request.subjectObjectId, client, decidedBy);
    }
  }

  // FINANCE/ADMIN can always see this — every subject_object_type registered today
  // (concession, expense, fee_structure, refund, purchase_request) is Finance's own
  // record, already visible to any FINANCE/ADMIN via that record's own detail page
  // (GET /finance/fee-structures/:id etc. carries no per-requester restriction) — so
  // gating the approval *history* of that same record to only the one person who
  // happened to click "activate" is an inconsistency, not a real security boundary.
  // Revisit this the day a non-Finance module (Hostel/Academics/Payroll, per this
  // engine's own module doc) registers a subject type FINANCE/ADMIN has no business
  // reading — this blanket allow should become per-request_type at that point.
  private static readonly ALWAYS_VISIBLE_TO = ['FINANCE', 'ADMIN'];

  private async assertCallerMayView(
    request: ApprovalRequestRow,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (request.requestedBy === actor.personId) return;
    if (actor.roles.some((r) => ApprovalsService.ALWAYS_VISIBLE_TO.includes(r)))
      return;
    const steps = await this.approvalStepRepo.listByRequest(request.id);
    const relevant = steps.some(
      (s) => s.approverRoleCode && actor.roles.includes(s.approverRoleCode),
    );
    if (!relevant) throw new ForbiddenException();
  }
}
