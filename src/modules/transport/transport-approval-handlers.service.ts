// Registers this module's 5 subject_object_type handlers with the generic
// approvals engine at startup -- same seam Community Proposals/Finance use
// (see community-proposal-approval-handlers.service.ts's own comment). Every
// handler here is Transport Manager's own "request X, Admin decides" path:
// nothing here ever runs from a direct write, only from a real ADMIN
// approve() decision on the engine's own /approvals/:id/approve.
//
// Deliberately no payload read here -- none of the 5 real side effects below
// need anything beyond the subjectId (vehicle/route/route_stop/allocation/
// driver), so there's no risk of acting on stale request-time data. The one
// exception worth calling out: a cancelled student_transport_allocation's
// validTo is set to the real approval date (today, at decision time), not
// whatever date the request happened to be raised on -- the same "effective
// as of today" default StudentTransportAllocationsService.cancel already
// uses for a direct Admin cancel.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import { VehicleRepository } from './repositories/vehicle.repository';
import { RouteRepository } from './repositories/route.repository';
import { RouteStopRepository } from './repositories/route-stop.repository';
import { StudentTransportAllocationRepository } from './repositories/student-transport-allocation.repository';
import { DriverRepository } from './repositories/driver.repository';

@Injectable()
export class TransportApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly vehicleRepo: VehicleRepository,
    private readonly routeRepo: RouteRepository,
    private readonly routeStopRepo: RouteStopRepository,
    private readonly allocationRepo: StudentTransportAllocationRepository,
    private readonly driverRepo: DriverRepository,
  ) {}

  onModuleInit(): void {
    // No real hard-delete for a vehicle exists anywhere in this app --
    // approval deactivates it (operational_status -> RETIRED, a real value
    // on the vehicle_operational_status_check constraint), the same
    // "deactivate, not delete" convention this codebase already follows
    // everywhere else. Rejection is a no-op: the vehicle stays exactly as it
    // was, nothing to undo.
    this.registry.register('vehicle', {
      onApproved: async (id, executor) => {
        await this.vehicleRepo.update(id, { operationalStatus: 'RETIRED' }, executor);
      },
      onRejected: async () => {
        /* no-op -- vehicle stays as-is */
      },
    });

    // Same "deactivate, not delete" reasoning as vehicle above.
    this.registry.register('route', {
      onApproved: async (id, executor) => {
        await this.routeRepo.update(id, { status: 'INACTIVE' }, executor);
      },
      onRejected: async () => {
        /* no-op -- route stays as-is */
      },
    });

    // Route stops are the one entity in this feature with a real hard
    // DELETE already (Admin's own direct action) -- approval performs that
    // exact same real delete, just requested by Transport Manager instead.
    this.registry.register('route_stop', {
      onApproved: async (id, executor) => {
        await this.routeStopRepo.delete(id, executor);
      },
      onRejected: async () => {
        /* no-op -- stop stays as-is */
      },
    });

    // Same real cancel a direct Admin action performs
    // (StudentTransportAllocationsService.cancel) -- validTo is today, the
    // real approval date, not the original request date (see module
    // comment).
    this.registry.register('student_transport_allocation', {
      onApproved: async (id, executor) => {
        const today = new Date().toISOString().slice(0, 10);
        await this.allocationRepo.cancel(id, today, executor);
      },
      onRejected: async () => {
        /* no-op -- allocation stays ACTIVE */
      },
    });

    // Same "deactivate, not delete" reasoning as vehicle/route above -- no
    // real hard-delete exists for a driver either.
    this.registry.register('driver', {
      onApproved: async (id, executor) => {
        await this.driverRepo.update(id, { status: 'INACTIVE' }, executor);
      },
      onRejected: async () => {
        /* no-op -- driver stays as-is */
      },
    });
  }
}
