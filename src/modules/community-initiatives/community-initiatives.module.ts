// Community Activities/Initiatives -- Phase 6 of the standalone Community
// application. No approvals-engine dependency here (unlike Phase 5) -- an
// initiative is created directly by Community once its originating proposal
// is APPROVED, not itself subject to a further approval step.

import { Module } from '@nestjs/common';
import { CommunityInitiativesController } from './community-initiatives.controller';
import { CommunityInitiativesService } from './community-initiatives.service';
import { CommunityInitiativeRepository } from './repositories/community-initiative.repository';

@Module({
  controllers: [CommunityInitiativesController],
  providers: [CommunityInitiativesService, CommunityInitiativeRepository],
})
export class CommunityInitiativesModule {}
