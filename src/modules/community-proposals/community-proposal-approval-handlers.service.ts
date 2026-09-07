// Registers community_proposal's subject_object_type handler with the generic
// approvals engine at startup -- same seam Finance uses (see
// finance-approval-handlers.service.ts). APPROVED/REJECTED are simple status
// flips; onSentBack is the one addition beyond simpleStateColumnHandler --
// this is the first module in this codebase to actually use it, since
// Community Proposals is the first workflow with a real "send back, revise,
// resubmit" cycle (see CommunityProposalsService.resubmit for why the
// resubmission itself isn't part of the generic engine).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import { CommunityProposalRepository } from './repositories/community-proposal.repository';

@Injectable()
export class CommunityProposalApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly proposalRepo: CommunityProposalRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register('community_proposal', {
      onApproved: async (id, executor, _decidedBy) => {
        await this.proposalRepo.setStatus(id, 'APPROVED', executor);
      },
      onRejected: async (id, executor, _decidedBy) => {
        await this.proposalRepo.setStatus(id, 'REJECTED', executor);
      },
      onSentBack: async (id, executor) => {
        await this.proposalRepo.setStatus(id, 'SENT_BACK', executor);
      },
    });
  }
}
