// Hostel Setup (Admin's scope, per workflow.md): hostel -> block -> floor -> room ->
// bed structure, plus student bed allocation/vacate. All tables already existed live
// in the DB -- pure application code, no schema changes. Daily warden operations
// (roll call, gate pass, mess attendance, incidents) are a later phase Warden owns,
// out of scope here.

import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { HostelAllocationsController } from './hostel-allocations.controller';
import { HostelAllocationsService } from './hostel-allocations.service';
import { HostelBlocksController } from './hostel-blocks.controller';
import { HostelBlocksService } from './hostel-blocks.service';
import { HostelFloorsController } from './hostel-floors.controller';
import { HostelFloorsService } from './hostel-floors.service';
import { HostelRoomsController } from './hostel-rooms.controller';
import { HostelRoomsService } from './hostel-rooms.service';
import { HostelAllocationRepository } from './repositories/hostel-allocation.repository';
import { HostelBedRepository } from './repositories/hostel-bed.repository';
import { HostelBlockRepository } from './repositories/hostel-block.repository';
import { HostelFloorRepository } from './repositories/hostel-floor.repository';
import { HostelRoomRepository } from './repositories/hostel-room.repository';
import { HostelRepository } from './repositories/hostel.repository';
import { HostelsController } from './hostels.controller';
import { HostelsService } from './hostels.service';

@Module({
  imports: [PeopleModule],
  controllers: [
    HostelsController,
    HostelBlocksController,
    HostelFloorsController,
    HostelRoomsController,
    HostelAllocationsController,
  ],
  providers: [
    HostelsService,
    HostelBlocksService,
    HostelFloorsService,
    HostelRoomsService,
    HostelAllocationsService,
    HostelRepository,
    HostelBlockRepository,
    HostelFloorRepository,
    HostelRoomRepository,
    HostelBedRepository,
    HostelAllocationRepository,
  ],
  // Repositories exported read-only for the Hostel Warden module's Room & Bed View
  // (Feature 8) -- reuses the exact same queries Admin's own screens use, rather than
  // a second copy, and the Warden module never calls any write method on these.
  exports: [
    HostelRepository,
    HostelBlockRepository,
    HostelFloorRepository,
    HostelRoomRepository,
    HostelBedRepository,
    HostelAllocationRepository,
  ],
})
export class HostelModule {}
