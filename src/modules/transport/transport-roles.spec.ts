// Locks down exactly which routes TRANSPORT_MANAGER can reach on each existing
// Transport controller -- same approach as messaging.controller.spec.ts's
// "route roles" suite. RolesGuard resolves role metadata via
// reflector.getAllAndOverride(ROLES_KEY, [handler, class]), which means a
// method-level @Roles(...) REPLACES the class-level one, never merges with
// it -- so a method with no override still carries the class's ADMIN-only
// metadata, and only the specific methods listed below carry the widened
// override. This suite exists to catch a future edit that accidentally
// widens (or narrows) one of these routes without noticing.

import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { AttendantsController } from './attendants.controller';
import { DriversController } from './drivers.controller';
import { RoutesController } from './routes.controller';
import { StudentTransportAllocationsController } from './student-transport-allocations.controller';
import { VehicleRouteAssignmentsController } from './vehicle-route-assignments.controller';
import { VehiclesController } from './vehicles.controller';

function classRolesOf(
  ctor: new (...args: never[]) => unknown,
): string[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, ctor);
}

function methodRolesOf(
  ctor: new (...args: never[]) => unknown,
  methodName: string,
): string[] | undefined {
  const proto = ctor.prototype as Record<string, unknown>;
  return Reflect.getMetadata(ROLES_KEY, proto[methodName] as never);
}

describe('Transport controllers — TRANSPORT_MANAGER route boundaries', () => {
  it('every existing Transport controller keeps ADMIN as its class-level default', () => {
    for (const ctor of [
      VehiclesController,
      RoutesController,
      DriversController,
      AttendantsController,
      VehicleRouteAssignmentsController,
      StudentTransportAllocationsController,
    ]) {
      expect(classRolesOf(ctor)).toEqual(['ADMIN']);
    }
  });

  it('read routes on VehiclesController/RoutesController/DriversController/AttendantsController/StudentTransportAllocationsController are widened to ADMIN+TRANSPORT_MANAGER', () => {
    expect(methodRolesOf(VehiclesController, 'list')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(VehiclesController, 'get')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(RoutesController, 'list')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'get')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'listStops')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'listAssignedStudents')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(DriversController, 'list')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(DriversController, 'get')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(AttendantsController, 'list')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(AttendantsController, 'get')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);

    expect(
      methodRolesOf(StudentTransportAllocationsController, 'list'),
    ).toEqual(['ADMIN', 'TRANSPORT_MANAGER']);
    expect(methodRolesOf(StudentTransportAllocationsController, 'get')).toEqual(
      ['ADMIN', 'TRANSPORT_MANAGER'],
    );
  });

  it('write routes (create/update/documents/maintenance/stops-write/cancel) have NO method-level override -- they fall back to the class-level ADMIN-only metadata', () => {
    expect(methodRolesOf(VehiclesController, 'create')).toBeUndefined();
    expect(methodRolesOf(VehiclesController, 'update')).toBeUndefined();
    expect(methodRolesOf(VehiclesController, 'createDocument')).toBeUndefined();
    expect(
      methodRolesOf(VehiclesController, 'createMaintenance'),
    ).toBeUndefined();

    expect(methodRolesOf(RoutesController, 'create')).toBeUndefined();
    expect(methodRolesOf(RoutesController, 'update')).toBeUndefined();
    expect(methodRolesOf(RoutesController, 'createStop')).toBeUndefined();
    expect(methodRolesOf(RoutesController, 'updateStop')).toBeUndefined();
    expect(methodRolesOf(RoutesController, 'deleteStop')).toBeUndefined();

    expect(methodRolesOf(DriversController, 'create')).toBeUndefined();
    expect(methodRolesOf(DriversController, 'update')).toBeUndefined();

    expect(methodRolesOf(AttendantsController, 'create')).toBeUndefined();
    expect(methodRolesOf(AttendantsController, 'update')).toBeUndefined();

    // Student transport allocation is Admin's configuration, never Transport
    // Manager's -- create/update/cancel must NOT be widened, only list/get.
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'create'),
    ).toBeUndefined();
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'update'),
    ).toBeUndefined();
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'cancel'),
    ).toBeUndefined();
  });

  it('VehicleRouteAssignmentsController is the one exception: TRANSPORT_MANAGER gets create/update too, not just read -- the real driver<->vehicle assignment action', () => {
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'list')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'get')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'create')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'update')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
  });

  it('no route anywhere in this module grants TRANSPORT_MANAGER something ADMIN itself lacks -- every allowed-roles array that includes TRANSPORT_MANAGER also includes ADMIN', () => {
    const allControllers = [
      VehiclesController,
      RoutesController,
      DriversController,
      AttendantsController,
      VehicleRouteAssignmentsController,
      StudentTransportAllocationsController,
    ];
    for (const ctor of allControllers) {
      for (const methodName of Object.getOwnPropertyNames(ctor.prototype)) {
        if (methodName === 'constructor') continue;
        const roles = methodRolesOf(ctor as never, methodName);
        if (roles?.includes('TRANSPORT_MANAGER')) {
          expect(roles).toContain('ADMIN');
        }
      }
    }
  });
});
