// Registers the 'outing_request' subject_object_type with the generic approvals
// engine (see modules/approvals/subject-state.registry.ts) at startup -- the seam
// that lets ApprovalsService.decide() flip an outing_request's own state, and issue
// the matching gate_pass, atomically with the Warden's decision, without the generic
// engine knowing anything about hostel tables. Same pattern as
// FinanceApprovalHandlers (finance module).
//
// One handler serves BOTH Gate Pass and Emergency Exit (same subject_object_type,
// same table) -- which of the two a given outing_request is gets read back from its
// own linked approval_request.request_type at decision time.

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queryable } from '../../infrastructure/postgres/postgres.service';
import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import {
  EMERGENCY_EXIT_REQUEST_TYPE,
  OutingRequestRepository,
} from './repositories/outing-request.repository';
import { GatePassRepository } from './repositories/gate-pass.repository';

@Injectable()
export class HostelWardenApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly outingRequestRepo: OutingRequestRepository,
    private readonly gatePassRepo: GatePassRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register('outing_request', {
      onApproved: async (
        id: string,
        executor: Queryable,
        decidedBy: string,
      ) => {
        const request = await this.outingRequestRepo.findById(id, executor);
        if (!request) return;
        await this.outingRequestRepo.markState(id, 'APPROVED', executor);
        const isEmergency = request.requestType === EMERGENCY_EXIT_REQUEST_TYPE;
        await this.gatePassRepo.create(
          {
            outingRequestId: id,
            studentId: request.studentId,
            isEmergency,
            emergencyReason: isEmergency ? request.reason : null,
            approvedBy: decidedBy,
            validFrom: request.outFrom,
            validTo: request.expectedReturn,
          },
          executor,
        );
      },
      onRejected: async (id: string, executor: Queryable) => {
        await this.outingRequestRepo.markState(id, 'REJECTED', executor);
      },
      onWithdrawn: async (id: string, executor: Queryable) => {
        await this.outingRequestRepo.markState(id, 'CANCELLED', executor);
      },
    });
  }
}
