// PENDING FEATURE -- see HostelWardenPendingModule for why this isn't wired into
// AppModule yet (hostel_call_request doesn't exist as a real table until a migration
// runs; see query.md).

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import { OutboxService } from '../../common/outbox/outbox.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApproveCallRequestDto } from './dto/approve-call-request.dto';
import {
  HostelCallRequestRepository,
  HostelCallRequestRow,
} from './repositories/hostel-call-request.repository';
import { WardenContextService } from './warden-context.service';

@Injectable()
export class CallRequestsService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly callRequestRepo: HostelCallRequestRepository,
    private readonly auditService: AuditService,
    private readonly outbox: OutboxService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.callRequestRepo.findManyForHostels(ctx.hostelIds);
  }

  private async getScoped(
    id: string,
    hostelIds: string[],
  ): Promise<HostelCallRequestRow> {
    const request = await this.callRequestRepo.findById(id);
    if (!request || !hostelIds.includes(request.hostelId)) {
      throw new NotFoundException(HOSTEL_WARDEN_ERRORS.CALL_REQUEST_NOT_FOUND);
    }
    return request;
  }

  async get(id: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.getScoped(id, ctx.hostelIds);
  }

  private async decide(
    id: string,
    personId: string,
    status: 'APPROVED' | 'REJECTED',
    window: { approvedFrom: Date; approvedTo: Date } | null,
  ) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    await this.getScoped(id, ctx.hostelIds);

    return this.unitOfWork.run(async (client) => {
      const locked = await this.callRequestRepo.findByIdForUpdate(id, client);
      if (!locked)
        throw new NotFoundException(
          HOSTEL_WARDEN_ERRORS.CALL_REQUEST_NOT_FOUND,
        );
      if (locked.status !== 'PENDING') {
        throw new ConflictException(
          HOSTEL_WARDEN_ERRORS.CALL_REQUEST_NOT_PENDING,
        );
      }

      await this.callRequestRepo.decide(
        id,
        {
          status,
          approvedFrom: window?.approvedFrom ?? null,
          approvedTo: window?.approvedTo ?? null,
          decidedByPersonId: personId,
        },
        client,
      );

      await this.auditService.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'HOSTEL_WARDEN',
          action: `HOSTEL_CALL_REQUEST_${status}`,
          objectType: 'hostel_call_request',
          objectId: id,
          outcome: status === 'APPROVED' ? 'SUCCESS' : 'DENIED',
          beforeData: locked,
        },
        client,
      );

      // Same reasoning as create(): this feature is deliberately not on the
      // generic approvals engine, so the requester-side notification has to
      // be raised here directly, not inherited for free.
      await this.outbox.enqueue(
        {
          personId: locked.parentPersonId,
          notificationType: `HOSTEL_CALL_REQUEST_${status}`,
          title:
            status === 'APPROVED'
              ? 'Your call request was approved'
              : 'Your call request was rejected',
          body:
            status === 'APPROVED'
              ? `Approved for ${window!.approvedFrom.toISOString()} to ${window!.approvedTo.toISOString()}`
              : 'The hostel warden rejected this call request',
          relatedObjectType: 'hostel_call_request',
          relatedObjectId: id,
        },
        client,
      );

      return (await this.callRequestRepo.findById(id, client))!;
    });
  }

  async approve(id: string, dto: ApproveCallRequestDto, personId: string) {
    return this.decide(id, personId, 'APPROVED', {
      approvedFrom: new Date(dto.approvedFrom),
      approvedTo: new Date(dto.approvedTo),
    });
  }

  async reject(id: string, personId: string) {
    return this.decide(id, personId, 'REJECTED', null);
  }
}
