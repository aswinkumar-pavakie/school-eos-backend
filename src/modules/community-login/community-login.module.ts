// Phase 1 (Community Login) only. Named community-login/ rather than reusing
// src/modules/communities/ deliberately -- that module is Admin/Principal's
// existing oversight of the PTA/community-activities feature (unrelated,
// untouched). This is the new COMMUNITY role's own login foundation; a real
// Community module (dashboard, sidebar, workflows) is a separate later phase.

import { Module } from '@nestjs/common';
import { CommunityEntryController } from './community-entry.controller';

@Module({
  controllers: [CommunityEntryController],
})
export class CommunityLoginModule {}
