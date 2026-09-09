// Transport Setup (Admin's scope, per workflow.md): vehicles, routes + stops, drivers,
// attendants, vehicle-route assignments, GPS devices + vehicle mappings. Everything
// here already existed live in the DB before this module -- pure application code, no
// schema changes. Daily boarding/alighting/live-GPS-ingestion ops are a later phase
// (device-credential identities, not Admin's own panel) and are out of scope here.

import { Module } from '@nestjs/common';
import { AttendantsController } from './attendants.controller';
import { AttendantsService } from './attendants.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { GpsDeviceMappingsController } from './gps-device-mappings.controller';
import { GpsDeviceMappingsService } from './gps-device-mappings.service';
import { GpsDevicesController } from './gps-devices.controller';
import { GpsDevicesService } from './gps-devices.service';
import { AttendantRepository } from './repositories/attendant.repository';
import { DriverRepository } from './repositories/driver.repository';
import { GpsDeviceMappingRepository } from './repositories/gps-device-mapping.repository';
import { GpsDeviceRepository } from './repositories/gps-device.repository';
import { RouteRepository } from './repositories/route.repository';
import { RouteStopRepository } from './repositories/route-stop.repository';
import { VehicleDocumentRepository } from './repositories/vehicle-document.repository';
import { VehicleMaintenanceRepository } from './repositories/vehicle-maintenance.repository';
import { VehicleRouteAssignmentRepository } from './repositories/vehicle-route-assignment.repository';
import { VehicleRepository } from './repositories/vehicle.repository';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { StudentTransportAllocationRepository } from './repositories/student-transport-allocation.repository';
import { StudentTransportAllocationsController } from './student-transport-allocations.controller';
import { StudentTransportAllocationsService } from './student-transport-allocations.service';
import { VehicleRouteAssignmentsController } from './vehicle-route-assignments.controller';
import { VehicleRouteAssignmentsService } from './vehicle-route-assignments.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [
    VehiclesController,
    RoutesController,
    DriversController,
    AttendantsController,
    VehicleRouteAssignmentsController,
    GpsDevicesController,
    GpsDeviceMappingsController,
    StudentTransportAllocationsController,
  ],
  providers: [
    VehiclesService,
    RoutesService,
    DriversService,
    AttendantsService,
    VehicleRouteAssignmentsService,
    GpsDevicesService,
    GpsDeviceMappingsService,
    StudentTransportAllocationsService,
    VehicleRepository,
    VehicleDocumentRepository,
    VehicleMaintenanceRepository,
    RouteRepository,
    RouteStopRepository,
    DriverRepository,
    AttendantRepository,
    VehicleRouteAssignmentRepository,
    GpsDeviceRepository,
    GpsDeviceMappingRepository,
    StudentTransportAllocationRepository,
  ],
  // VehiclesService/RoutesService/DriversService/VehicleRouteAssignmentsService:
  // so transport-ops (Bus Tracking / Boarding Monitor) can resolve vehicle/route/
  // driver/current-assignment through the real existing services instead of a
  // second copy of these queries -- same cross-module reuse pattern used
  // throughout this codebase.
  exports: [
    StudentTransportAllocationsService,
    VehiclesService,
    RoutesService,
    DriversService,
    VehicleRouteAssignmentsService,
  ],
})
export class TransportModule {}
