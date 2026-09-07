// Community Membership Requests -- lets the standalone Community login
// propose adding/removing a member of its OWN community, reviewed by
// Principal through the EXISTING generic approvals engine (ApprovalsModule),
// same pattern CommunityProposalsModule already uses. Imports CommunitiesModule
// only for its exported CommunityMembershipRepository -- the approval handler
// writes into the exact same community_membership table Admin's own module
// owns, rather than duplicating that table or its create()/remove() logic.
import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CommunitiesModule } from '../communities/communities.module';
import { CommunityMembershipRequestApprovalHandlers } from './community-membership-request-approval-handlers.service';
import { CommunityMembershipRequestsController } from './community-membership-requests.controller';
import { CommunityMembershipRequestsService } from './community-membership-requests.service';
import { CommunityMembershipRequestRepository } from './repositories/community-membership-request.repository';

@Module({
  imports: [ApprovalsModule, CommunitiesModule],
  controllers: [CommunityMembershipRequestsController],
  providers: [
    CommunityMembershipRequestsService,
    CommunityMembershipRequestRepository,
    CommunityMembershipRequestApprovalHandlers,
  ],
})
export class CommunityMembershipRequestsModule {}
