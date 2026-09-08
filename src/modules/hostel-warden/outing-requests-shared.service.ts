// Shared read/decide logic behind BOTH Gate Pass and Emergency Exit -- identical
// underlying table (outing_request) and identical decision mechanics (the generic
// approvals engine), differing only in which `request_type` string each feature's
// controller passes in. Kept as one injectable rather than two near-duplicate
// services, per this codebase's own "don't duplicate a query a second time" rule.
//
// Listing/detail are answered directly from OutingRequestRepository's own
// hostel-scoped join (never delegated to ApprovalsService.getById/listForCaller,
// which only check role membership, not hostel scope -- see the module README).
// The decision itself (approve/reject) IS delegated to ApprovalsService, whose
// personHoldsRole check IS properly scoped via payload.approverScope -- but only
// after this service's own getScoped() has already confirmed the request belongs to
// one of the caller's hostels and is of the expected request_type, so a stale/
// cross-hostel/wrong-type id gets a clean 404 rather than reaching the engine at all.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  OutingRequestRepository,
  OutingRequestRow,
} from './repositories/outing-request.repository';
import { WardenContextService } from './warden-context.service';

@Injectable()
export class OutingRequestsSharedService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly outingRequestRepo: OutingRequestRepository,
    private readonly approvalsService: ApprovalsService,
  ) {}

  async list(
    personId: string,
    requestType: string,
  ): Promise<OutingRequestRow[]> {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.outingRequestRepo.findManyForHostels(
      ctx.hostelIds,
      requestType,
    );
  }

  private async getScoped(
    id: string,
    hostelIds: string[],
    requestType: string,
  ): Promise<OutingRequestRow> {
    const request = await this.outingRequestRepo.findById(id);
    if (!request || request.requestType !== requestType) {
      throw new NotFoundException(
        HOSTEL_WARDEN_ERRORS.OUTING_REQUEST_NOT_FOUND,
      );
    }
    const scoped = await this.outingRequestRepo.findManyForHostels(
      hostelIds,
      requestType,
    );
    if (!scoped.some((r) => r.id === id)) {
      throw new NotFoundException(
        HOSTEL_WARDEN_ERRORS.OUTING_REQUEST_NOT_FOUND,
      );
    }
    return request;
  }

  async get(
    id: string,
    personId: string,
    requestType: string,
  ): Promise<OutingRequestRow> {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.getScoped(id, ctx.hostelIds, requestType);
  }

  async approve(
    id: string,
    actor: AuthenticatedUser,
    requestType: string,
    comment: string | undefined,
  ): Promise<OutingRequestRow> {
    const ctx = await this.wardenContext.requireActiveWarden(actor.personId);
    const request = await this.getScoped(id, ctx.hostelIds, requestType);
    if (!request.approvalRequestId) {
      throw new ForbiddenException(
        HOSTEL_WARDEN_ERRORS.OUTING_REQUEST_NOT_PENDING,
      );
    }
    // ApprovalsService.approve runs its own UnitOfWork transaction internally
    // (decision + subject-state handler + audit + outbox, all atomic already) --
    // no outer transaction wrapper needed here.
    await this.approvalsService.approve(
      request.approvalRequestId,
      actor,
      comment,
    );
    return (await this.outingRequestRepo.findById(id))!;
  }

  async reject(
    id: string,
    actor: AuthenticatedUser,
    requestType: string,
    comment: string,
  ): Promise<OutingRequestRow> {
    const ctx = await this.wardenContext.requireActiveWarden(actor.personId);
    const request = await this.getScoped(id, ctx.hostelIds, requestType);
    if (!request.approvalRequestId) {
      throw new ForbiddenException(
        HOSTEL_WARDEN_ERRORS.OUTING_REQUEST_NOT_PENDING,
      );
    }
    await this.approvalsService.reject(
      request.approvalRequestId,
      actor,
      comment,
    );
    return (await this.outingRequestRepo.findById(id))!;
  }
}
