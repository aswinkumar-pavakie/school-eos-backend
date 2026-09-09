// Registers the 'complaint' subject_object_type with the generic approvals engine
// (see modules/approvals/subject-state.registry.ts) -- the seam that lets
// ApprovalsService.decide() flip a complaint's own state the moment the Principal
// approves/rejects it. Lives in HostelWardenPendingModule (not the always-live
// HostelWardenApprovalHandlers in HostelWardenModule) because HostelComplaintRepository
// itself lives here -- HostelWardenModule doesn't import this module, so it can't see
// this repository, and this module already imports HostelWardenModule the other way.
//
// APPROVED -> IN_PROGRESS (Principal has reviewed and greenlit it; the Warden acts on
// it next -- same meaning IN_PROGRESS already has in the Warden's own updateStatus
// state machine). REJECTED -> REJECTED (an existing terminal state, not invented here).

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queryable } from '../../infrastructure/postgres/postgres.service';
import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import { HostelComplaintRepository } from './repositories/hostel-complaint.repository';

@Injectable()
export class ComplaintApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly complaintRepo: HostelComplaintRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register('complaint', {
      onApproved: async (id: string, executor: Queryable) => {
        await this.complaintRepo.updateState(id, 'IN_PROGRESS', executor);
      },
      onRejected: async (id: string, executor: Queryable) => {
        await this.complaintRepo.updateState(id, 'REJECTED', executor);
      },
    });
  }
}
