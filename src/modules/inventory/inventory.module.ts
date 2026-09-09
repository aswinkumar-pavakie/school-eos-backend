// Inventory Management -- Admin feature for general school-owned assets/stock
// (Sports equipment, Lab equipment, IT equipment, Furniture, School supplies,
// etc.). Distinct from the Sports module's own `equipment`/`equipment_issue`
// tables, which are scoped to kit lent out per-sport to students/teams, not a
// general asset registry. Also distinct from Transport's `vehicle_maintenance`,
// which stays exactly where it is. No dedicated history table -- every action
// records an audit_event (objectType 'inventory_item'/'inventory_category'),
// read back via the existing /admin/audit screen.

import { Module } from '@nestjs/common';
import { InventoryCategoriesController } from './inventory-categories.controller';
import { InventoryCategoriesService } from './inventory-categories.service';
import { InventoryItemsController } from './inventory-items.controller';
import { InventoryItemsService } from './inventory-items.service';
import { InventoryCategoryRepository } from './repositories/inventory-category.repository';
import { InventoryItemRepository } from './repositories/inventory-item.repository';

@Module({
  controllers: [InventoryCategoriesController, InventoryItemsController],
  providers: [
    InventoryCategoriesService,
    InventoryItemsService,
    InventoryCategoryRepository,
    InventoryItemRepository,
  ],
  // MaintenanceModule needs InventoryItemRepository directly: completing a repair
  // request that's linked to a DAMAGED item flips that item back to AVAILABLE, in
  // the same transaction as the repair's own completion -- same cross-module
  // pattern as PeopleModule exporting StudentRepository to HostelModule.
  // InventoryItemsService additionally backs the "Inventory request" effect in
  // RequestsApprovalsModule (issue/transfer, both already row-locked + audited).
  // InventoryCategoryRepository/InventoryCategoriesService are reused as-is by
  // MediaModule's own scoped inventory view (Media & AV Equipment category only).
  exports: [InventoryItemRepository, InventoryItemsService, InventoryCategoryRepository, InventoryCategoriesService],
})
export class InventoryModule {}
