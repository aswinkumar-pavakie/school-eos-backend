// Community Proposals/Requests -- Phase 5 of the standalone Community
// application. Reuses the existing generic approvals engine (ApprovalsModule)
// exactly the way Finance's Purchase Requests and Media Room's indents do --
// no new approval system, no duplicate audit system.

import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CommunityProposalApprovalHandlers } from './community-proposal-approval-handlers.service';
import { CommunityProposalsController } from './community-proposals.controller';
import { CommunityProposalsService } from './community-proposals.service';
import { CommunityProposalRepository } from './repositories/community-proposal.repository';

@Module({
  imports: [ApprovalsModule],
  controllers: [CommunityProposalsController],
  providers: [
    CommunityProposalsService,
    CommunityProposalRepository,
    CommunityProposalApprovalHandlers,
  ],
})
export class CommunityProposalsModule {}
