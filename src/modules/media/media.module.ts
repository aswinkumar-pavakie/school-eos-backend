import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MediaDashboardController } from './media-dashboard.controller';
import { MediaDashboardService } from './media-dashboard.service';
import { MediaIndentsController } from './media-indents.controller';
import { MediaInventoryController } from './media-inventory.controller';
import { MediaPostsController } from './media-posts.controller';
import { MediaPostsScheduler } from './media-posts.scheduler';
import { MediaPostsService } from './media-posts.service';
import { MediaTeamController } from './media-team.controller';
import { MediaTeamService } from './media-team.service';
import { MediaPostCommentRepository } from './repositories/media-post-comment.repository';
import { MediaPostRepository } from './repositories/media-post.repository';
import { MediaTeamMemberRepository } from './repositories/media-team-member.repository';
import { ShootAssignmentRepository } from './repositories/shoot-assignment.repository';
import { ShootAssignmentsController } from './shoot-assignments.controller';
import { ShootAssignmentsService } from './shoot-assignments.service';

@Module({
  // FinanceModule: reuses PurchaseRequestsService/repositories for Raise Indent
  // (see media-indents.controller.ts). InventoryModule: reuses
  // InventoryItemsService/InventoryCategoryRepository for the scoped Media & AV
  // Equipment register (see media-inventory.controller.ts).
  imports: [FinanceModule, InventoryModule],
  controllers: [
    MediaTeamController,
    ShootAssignmentsController,
    MediaPostsController,
    MediaInventoryController,
    MediaIndentsController,
    MediaDashboardController,
  ],
  providers: [
    AuditService,
    MediaTeamMemberRepository,
    ShootAssignmentRepository,
    MediaPostRepository,
    MediaPostCommentRepository,
    MediaTeamService,
    ShootAssignmentsService,
    MediaPostsService,
    MediaPostsScheduler,
    MediaDashboardService,
  ],
})
export class MediaModule {}
