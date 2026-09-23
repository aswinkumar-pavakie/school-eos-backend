// Faculty's own Campus tiles (Food Court, Medical, Copy Center, Stationery
// Store, House) -- see database/migrations/0028_campus_features.sql for the
// full reasoning on why these are new, minimal tables rather than reusing
// the much bigger canteen/wallet ERD or the purchase_request/purchase_order
// procurement flow. HouseRepository is provided here too, not exported from
// AcademicModule -- it's stateless (just wraps PostgresService), so a
// second instance here is simpler and lower-risk than widening that
// module's own exports for one read-only reuse.

import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HouseRepository } from '../academic/repositories/house.repository';
import { CampusController } from './campus.controller';
import { CampusService } from './campus.service';
import { CampusRequestRepository } from './repositories/campus-request.repository';

@Module({
  controllers: [CampusController],
  providers: [CampusService, CampusRequestRepository, HouseRepository, AuditService],
})
export class CampusModule {}
