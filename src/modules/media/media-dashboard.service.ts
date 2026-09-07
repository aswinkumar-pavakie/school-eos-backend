// Real, DB-computed KPI numbers for the Media Room dashboard -- never a
// client-side reduce over a page of rows.

import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { InventoryCategoryRepository } from '../inventory/repositories/inventory-category.repository';
import { InventoryItemRepository } from '../inventory/repositories/inventory-item.repository';
import { PurchaseRequestsService } from '../finance/purchase-requests/purchase-requests.service';
import { MediaPostRepository } from './repositories/media-post.repository';
import { ShootAssignmentRepository } from './repositories/shoot-assignment.repository';

const MEDIA_CATEGORY_NAME = 'Media & AV Equipment';

@Injectable()
export class MediaDashboardService {
  constructor(
    private readonly shootRepo: ShootAssignmentRepository,
    private readonly postRepo: MediaPostRepository,
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly inventoryItemRepo: InventoryItemRepository,
    private readonly inventoryCategoryRepo: InventoryCategoryRepository,
  ) {}

  async summary(actor: AuthenticatedUser) {
    const [shootsToday, postCounts, pendingIndents, todaysShoots, categories] = await Promise.all([
      this.shootRepo.countToday(),
      this.postRepo.countByState(),
      this.purchaseRequestsService.list({ state: 'PENDING' }, { page: 1, pageSize: 1 }, actor),
      this.shootRepo.list({ from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }),
      this.inventoryCategoryRepo.findMany(),
    ]);

    const mediaCategory = categories.find((c) => c.name === MEDIA_CATEGORY_NAME);
    const lowStock = mediaCategory
      ? (await this.inventoryItemRepo.findMany({ categoryId: mediaCategory.id, limit: 200, offset: 0 })).rows.filter(
          (item) => item.quantity <= (item.lowStockThreshold ?? 0),
        )
      : [];

    return {
      shootsToday,
      scheduledPosts: postCounts.SCHEDULED ?? 0,
      livePosts: postCounts.PUBLISHED ?? 0,
      draftPosts: postCounts.DRAFT ?? 0,
      pendingIndents: pendingIndents.total,
      todaysShoots: todaysShoots.filter((s) => s.status !== 'CANCELLED'),
      lowStockItems: lowStock.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, lowStockThreshold: item.lowStockThreshold })),
    };
  }
}
