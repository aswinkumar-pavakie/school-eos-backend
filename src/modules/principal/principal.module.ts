import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { LibraryModule } from '../library/library.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { SportsModule } from '../sports/sports.module';
import { TransportModule } from '../transport/transport.module';
import { PrincipalDashboardController } from './principal-dashboard.controller';
import { PrincipalDashboardService } from './principal-dashboard.service';

// Correspondent Phase 5 addition -- the shared dashboard summary's real
// operational KPIs (Inventory/Maintenance/Sports/Library) reuse each module's
// own existing overview service rather than duplicating those count queries
// here (same "no authoritative repository being duplicated" rule this
// service's own header comment already follows for its other fields).
// Phase 8 addition -- TransportModule's own VehiclesService.complianceSummary()
// (real vehicle_document + driver_document expiry counts) backs the
// Compliance dashboard KPI, same reuse pattern.
@Module({
  imports: [InventoryModule, MaintenanceModule, LibraryModule, SportsModule, TransportModule],
  controllers: [PrincipalDashboardController],
  providers: [PrincipalDashboardService],
})
export class PrincipalModule {}
