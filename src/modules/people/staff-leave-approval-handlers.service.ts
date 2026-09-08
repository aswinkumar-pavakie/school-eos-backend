// Registers staff_leave_request's subject_object_type handler with the
// generic approvals engine at startup -- same seam Finance and Community
// Proposals already use (see finance-approval-handlers.service.ts /
// community-proposal-approval-handlers.service.ts). Plain APPROVED/REJECTED
// status flips via simpleStateColumnHandler -- the STAFF_LEAVE_REQUEST
// approval_policy is a single, unconditional step (PRINCIPAL), so there is
// no multi-step advancement or send-back cycle to react to here (unlike
// Community Proposals' own onSentBack), matching this table's own
// chk_staff_leave_request_state CHECK constraint (PENDING/APPROVED/REJECTED
// only -- no SENT_BACK value exists for it to hold).
//
// This handler was missing from the codebase despite the real
// staff_leave_request table and approval_policy row already existing and
// already holding correctly-decided historical data -- restoring it (not
// inventing anything new) is what makes those PENDING rows decidable again
// and what backs Vice Principal's own My Leave module (Phase 28).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { simpleStateColumnHandler, SubjectStateRegistry } from '../approvals/subject-state.registry';

@Injectable()
export class StaffLeaveApprovalHandlers implements OnModuleInit {
  constructor(private readonly registry: SubjectStateRegistry) {}

  onModuleInit(): void {
    this.registry.register('staff_leave_request', simpleStateColumnHandler('staff_leave_request'));
  }
}
