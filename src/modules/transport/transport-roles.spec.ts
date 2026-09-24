// Locks down exactly which routes TRANSPORT_MANAGER can reach on each existing
// Transport controller -- same approach as messaging.controller.spec.ts's
// "route roles" suite. RolesGuard resolves role metadata via
// reflector.getAllAndOverride(ROLES_KEY, [handler, class]), which means a
// method-level @Roles(...) REPLACES the class-level one, never merges with
// it -- so a method with no override still carries the class's own default
// metadata (NOT always ADMIN-only -- VehiclesController/RoutesController/
// DriversController/VehicleRouteAssignmentsController each carry their own
// real PRINCIPAL/VICE_PRINCIPAL oversight grant at the class level too, see
// each assertion below for the real value), and only the specific methods
// listed carry a widened or narrowed override. This suite exists to catch a
// future edit that accidentally widens (or narrows) one of these routes
// without noticing.
//
// Real, explicit product decision (Transport Module reframe, this phase):
// Transport Manager now gets real create+edit on vehicles/routes/route
// stops/student transport allocations. Every delete-equivalent action
// (vehicle/route deactivate, route stop delete, allocation cancel) stays
// ADMIN-only on its real direct endpoint -- Transport Manager's own path is
// a sibling "request-*" endpoint that only ever creates an approval_request
// via the generic approvals engine (see transport-approval-handlers.service.ts),
// never a direct write. Those request-* endpoints are deliberately
// TRANSPORT_MANAGER-only (no ADMIN grant) -- Admin doesn't need to "request"
// an action it can already perform directly -- which is why they're
// excluded from the "TRANSPORT_MANAGER implies ADMIN" invariant below by
// name, not silently allowed to violate it.

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

// The real TRANSPORT_MANAGER-only request-* endpoints -- see module comment
// above for why these are the one deliberate exception to "TRANSPORT_MANAGER
// implies ADMIN".
const TRANSPORT_MANAGER_ONLY_METHODS: Record<string, string[]> = {
  VehiclesController: ['requestDeactivate'],
  RoutesController: ['requestDeactivate', 'requestDeleteStop'],
  DriversController: ['requestDeactivate'],
  StudentTransportAllocationsController: ['requestCancel'],
};

describe('Transport controllers — TRANSPORT_MANAGER route boundaries', () => {
  it('each controller carries its own real class-level default (not uniformly ADMIN-only)', () => {
    expect(classRolesOf(VehiclesController)).toEqual(['ADMIN', 'PRINCIPAL', 'CORRESPONDENT']);
    expect(classRolesOf(RoutesController)).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
    ]);
    expect(classRolesOf(DriversController)).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
    ]);
    expect(classRolesOf(AttendantsController)).toEqual(['ADMIN']);
    expect(classRolesOf(VehicleRouteAssignmentsController)).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
    ]);
    expect(classRolesOf(StudentTransportAllocationsController)).toEqual([
      'ADMIN',
    ]);
  });

  it('read routes are widened to include TRANSPORT_MANAGER (on top of each controller\'s own class-level oversight roles)', () => {
    expect(methodRolesOf(VehiclesController, 'list')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(VehiclesController, 'get')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(RoutesController, 'list')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'get')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'listStops')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'listAssignedStudents')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(DriversController, 'list')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(DriversController, 'get')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(AttendantsController, 'list')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(AttendantsController, 'get')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);

    expect(
      methodRolesOf(VehicleRouteAssignmentsController, 'list'),
    ).toEqual(['ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER']);
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'get')).toEqual([
      'ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'VICE_PRINCIPAL',
      'TRANSPORT_MANAGER',
    ]);

    // Student transport allocation has no PRINCIPAL/VICE_PRINCIPAL oversight
    // grant at all -- just ADMIN + TRANSPORT_MANAGER, deliberately narrower
    // than the other 5 controllers above.
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'list'),
    ).toEqual(['ADMIN', 'TRANSPORT_MANAGER']);
    expect(methodRolesOf(StudentTransportAllocationsController, 'get')).toEqual(
      ['ADMIN', 'TRANSPORT_MANAGER'],
    );
  });

  it('vehicle/route/route-stop/student-allocation create+edit are widened to ADMIN+TRANSPORT_MANAGER -- the real create/edit grant this phase adds', () => {
    expect(methodRolesOf(VehiclesController, 'create')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(VehiclesController, 'update')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);

    expect(methodRolesOf(RoutesController, 'create')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'update')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'createStop')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'updateStop')).toEqual([
      'ADMIN',
      'TRANSPORT_MANAGER',
    ]);

    expect(
      methodRolesOf(StudentTransportAllocationsController, 'create'),
    ).toEqual(['ADMIN', 'TRANSPORT_MANAGER']);
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'update'),
    ).toEqual(['ADMIN', 'TRANSPORT_MANAGER']);
  });

  it('every real delete-equivalent action stays ADMIN-only on its direct endpoint -- Transport Manager only ever reaches it through a request-* endpoint', () => {
    // Explicit ADMIN-only override (redundant with the class default, but
    // real and present) -- the one hard DELETE this feature has today.
    expect(methodRolesOf(RoutesController, 'deleteStop')).toEqual(['ADMIN']);
    // No override at all -- falls back to the class-level ADMIN-only default.
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'cancel'),
    ).toBeUndefined();

    // Driver/attendant create+update are untouched by this phase -- neither
    // ever included TRANSPORT_MANAGER before or now. Drivers has an
    // explicit ADMIN-only override (narrower than its own PRINCIPAL/
    // VICE_PRINCIPAL class default); Attendants has no override at all, so
    // it falls back to its own ADMIN-only class default.
    expect(methodRolesOf(DriversController, 'create')).toEqual(['ADMIN']);
    expect(methodRolesOf(DriversController, 'update')).toEqual(['ADMIN', 'TRANSPORT_MANAGER']);
    expect(methodRolesOf(AttendantsController, 'create')).toBeUndefined();
    expect(methodRolesOf(AttendantsController, 'update')).toBeUndefined();
  });

  it("the request-* endpoints (Transport Manager's own path to a delete-equivalent action) are TRANSPORT_MANAGER-only -- Admin never needs them, it already has the real direct endpoint", () => {
    expect(methodRolesOf(VehiclesController, 'requestDeactivate')).toEqual([
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'requestDeactivate')).toEqual([
      'TRANSPORT_MANAGER',
    ]);
    expect(methodRolesOf(RoutesController, 'requestDeleteStop')).toEqual([
      'TRANSPORT_MANAGER',
    ]);
    expect(
      methodRolesOf(StudentTransportAllocationsController, 'requestCancel'),
    ).toEqual(['TRANSPORT_MANAGER']);
  });

  it('VehicleRouteAssignmentsController is the one other exception: TRANSPORT_MANAGER gets create/update too, not just read -- the real driver<->vehicle assignment action', () => {
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'create')).toEqual(
      ['ADMIN', 'TRANSPORT_MANAGER'],
    );
    expect(methodRolesOf(VehicleRouteAssignmentsController, 'update')).toEqual(
      ['ADMIN', 'TRANSPORT_MANAGER'],
    );
  });

  it('no route anywhere in this module grants TRANSPORT_MANAGER something ADMIN itself lacks, except the real, named request-* endpoints above', () => {
    const allControllers = [
      VehiclesController,
      RoutesController,
      DriversController,
      AttendantsController,
      VehicleRouteAssignmentsController,
      StudentTransportAllocationsController,
    ];
    for (const ctor of allControllers) {
      const exceptions = TRANSPORT_MANAGER_ONLY_METHODS[ctor.name] ?? [];
      for (const methodName of Object.getOwnPropertyNames(ctor.prototype)) {
        if (methodName === 'constructor') continue;
        if (exceptions.includes(methodName)) continue;
        const roles = methodRolesOf(ctor as never, methodName);
        if (roles?.includes('TRANSPORT_MANAGER')) {
          expect(roles).toContain('ADMIN');
        }
      }
    }
  });
});
