// Repair & Maintenance -- Admin feature for general school assets/equipment/
// facilities. Vehicle repair/maintenance is explicitly out of scope here and
// stays under Transport -> Vehicles (`vehicle_maintenance`), never duplicated.
// No dedicated history table -- every action records an audit_event
// (objectType 'repair_request'), read back via the existing /admin/audit screen.

import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { RepairRequestsController } from './repair-requests.controller';
import { RepairRequestsService } from './repair-requests.service';
import { RepairRequestRepository } from './repositories/repair-request.repository';

@Module({
  // Needed only for the one Inventory <-> Repair integration point: completing a
  // request linked to a DAMAGED item flips that item back to AVAILABLE.
  imports: [InventoryModule],
  controllers: [RepairRequestsController],
  providers: [RepairRequestsService, RepairRequestRepository],
  // RequestsApprovalsModule needs this for the "Repair & Maintenance request"
  // effect -- approving one creates the real repair_request via this same
  // service (never a second, disconnected record).
  exports: [RepairRequestsService],
})
export class MaintenanceModule {}
