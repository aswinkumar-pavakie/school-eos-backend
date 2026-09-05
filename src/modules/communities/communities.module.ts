import { Module } from '@nestjs/common';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityActivitiesController } from './community-activities.controller';
import { CommunityActivitiesService } from './community-activities.service';
import { CommunityAnnouncementsController } from './community-announcements.controller';
import { CommunityAnnouncementsService } from './community-announcements.service';
import { CommunityMembershipsController } from './community-memberships.controller';
import { CommunityMembershipsService } from './community-memberships.service';
import { CommunityActivityRepository } from './repositories/community-activity.repository';
import { CommunityAnnouncementRepository } from './repositories/community-announcement.repository';
import { CommunityMembershipRepository } from './repositories/community-membership.repository';
import { CommunityRepository } from './repositories/community.repository';

@Module({
  controllers: [
    CommunitiesController,
    CommunityMembershipsController,
    CommunityActivitiesController,
    CommunityAnnouncementsController,
  ],
  providers: [
    CommunitiesService,
    CommunityMembershipsService,
    CommunityActivitiesService,
    CommunityAnnouncementsService,
    CommunityRepository,
    CommunityMembershipRepository,
    CommunityActivityRepository,
    CommunityAnnouncementRepository,
  ],
})
export class CommunitiesModule {}
