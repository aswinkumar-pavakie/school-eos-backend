import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { TransportModule } from '../transport/transport.module';
import { DriverAppController } from './driver-app.controller';
import { DriverAppService } from './driver-app.service';
import { DriverAppRepository } from './repositories/driver-app.repository';

// Driver Phase 2 (manual boarding fallback). Reuses TransportModule's own
// DriverRepository/VehicleRouteAssignmentRepository for scope resolution --
// only the driver-app-specific queries (my-students join, trip find-or-
// create, boarding-event insert) live in DriverAppRepository, since no
// existing service/repository already exposes those.
@Module({
  imports: [TransportModule],
  controllers: [DriverAppController],
  providers: [DriverAppService, DriverAppRepository, UnitOfWork, AuditService],
})
export class DriverAppModule {}
