// Parent-facing orchestration: list/detail/consent/decline for permission_request,
// plus the reusable isStudentConsented() participation check other modules
// (Trips/Sports/Activities/Events -- not implemented here) can call later.
//
// Every parent-facing method re-derives authorization live through
// PermissionRequestRepository's guardian_link + student_enrolment join -- never
// from a stored parent_person_id (there isn't one) and never from client input.
// A request that doesn't exist and one that exists but belongs to another
// parent's ward are identically 404 (see findForParent).

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { AuditService } from '../../common/audit/audit.service';
import { PERMISSION_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { DeclinePermissionRequestDto } from './dto/decline-permission-request.dto';
import { effectiveStatus, isPastDeadline } from './permission-status.util';
import {
  PermissionDecision,
  PermissionRequestDetailView,
  PermissionRequestRepository,
} from './repositories/permission-request.repository';

export type PermissionRequestDto = PermissionRequestDetailView;

@Injectable()
export class PermissionRequestService {
  constructor(
    private readonly requestRepo: PermissionRequestRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private toDto(request: PermissionRequestDetailView): PermissionRequestDto {
    return {
      ...request,
      status: effectiveStatus(request.status, request.responseDeadline),
    };
  }

  // ---- List / detail ------------------------------------------------------------------

  async list(actor: AuthenticatedUser): Promise<PermissionRequestDto[]> {
    const requests = await this.requestRepo.listForParent(actor.personId);
    return requests.map((r) => this.toDto(r));
  }

  async detail(
    actor: AuthenticatedUser,
    requestId: string,
  ): Promise<PermissionRequestDto> {
    const request = await this.requestRepo.findForParent(
      requestId,
      actor.personId,
    );
    if (!request) {
      throw new NotFoundException(PERMISSION_ERRORS.REQUEST_NOT_FOUND);
    }
    return this.toDto(request);
  }

  // ---- Consent / decline --------------------------------------------------------------

  async consent(
    actor: AuthenticatedUser,
    requestId: string,
  ): Promise<PermissionRequestDto> {
    return this.decide(actor, requestId, 'CONSENTED', null);
  }

  async decline(
    actor: AuthenticatedUser,
    requestId: string,
    dto: DeclinePermissionRequestDto,
  ): Promise<PermissionRequestDto> {
    return this.decide(actor, requestId, 'DECLINED', dto.reason ?? null);
  }

  /** Shared consent/decline path. Idempotent on an identical repeat decision;
   * rejects a conflicting decision from a second guardian or a stale client;
   * enforces the deadline live on every call; retries exactly once against a
   * concurrent resolution (activity cancel cascade, or another guardian's
   * response) before treating the outcome as final. */
  private async decide(
    actor: AuthenticatedUser,
    requestId: string,
    decision: PermissionDecision,
    reason: string | null,
    attempt = 0,
  ): Promise<PermissionRequestDto> {
    const request = await this.requestRepo.findForParent(
      requestId,
      actor.personId,
    );
    if (!request) {
      throw new NotFoundException(PERMISSION_ERRORS.REQUEST_NOT_FOUND);
    }

    const current = effectiveStatus(request.status, request.responseDeadline);

    if (current !== 'PENDING') {
      // Every non-PENDING outcome is resolved without touching the DB again --
      // either it's the same decision already recorded (idempotent repeat) or a
      // genuine conflict/terminal state that must never be silently overwritten.
      if (current === decision) {
        return this.toDto(request);
      }
      if (current === 'EXPIRED') {
        throw new ConflictException(PERMISSION_ERRORS.REQUEST_EXPIRED);
      }
      if (current === 'CANCELLED') {
        throw new ConflictException(
          PERMISSION_ERRORS.REQUEST_ALREADY_CANCELLED,
        );
      }
      if (current === 'CONSENTED') {
        throw new ConflictException(
          PERMISSION_ERRORS.REQUEST_ALREADY_CONSENTED,
        );
      }
      throw new ConflictException(PERMISSION_ERRORS.REQUEST_ALREADY_DECLINED);
    }

    if (isPastDeadline(request.responseDeadline)) {
      throw new ConflictException(PERMISSION_ERRORS.REQUEST_EXPIRED);
    }

    const claimed = await this.unitOfWork.run((client) =>
      this.requestRepo.claimDecision(
        requestId,
        decision,
        actor.personId,
        reason,
        client,
      ),
    );

    if (!claimed) {
      // Lost a race (another guardian's response, or an activity-cancel cascade,
      // landed first) -- re-fetch and resolve via the same idempotent/conflict
      // logic above, exactly once, rather than looping indefinitely.
      if (attempt > 0) {
        throw new ConflictException(
          PERMISSION_ERRORS.REQUEST_ALREADY_CANCELLED,
        );
      }
      return this.decide(actor, requestId, decision, reason, attempt + 1);
    }

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'PARENT',
      action:
        decision === 'CONSENTED'
          ? 'PERMISSION_REQUEST_CONSENTED'
          : 'PERMISSION_REQUEST_DECLINED',
      objectType: 'permission_request',
      objectId: requestId,
      outcome: 'SUCCESS',
      afterData: { status: decision, declineReason: reason },
    });

    const updated = await this.requestRepo.findForParent(
      requestId,
      actor.personId,
    );
    return this.toDto(updated!);
  }

  // ---- Reusable participation check for other modules ----------------------------

  /** For future consumers (Trips/Sports/Activities/Events -- not implemented here):
   * true only if this exact permission_request belongs to this exact student AND
   * is currently, effectively CONSENTED (never EXPIRED/CANCELLED/PENDING/DECLINED).
   * No parent-auth context required -- this is an internal service-to-service
   * check, not an HTTP-authorized endpoint. */
  async isStudentConsented(
    permissionRequestId: string,
    studentId: string,
  ): Promise<boolean> {
    const request = await this.requestRepo.findById(permissionRequestId);
    if (!request || request.studentId !== studentId) {
      return false;
    }
    return (
      effectiveStatus(request.status, request.responseDeadline) === 'CONSENTED'
    );
  }
}
