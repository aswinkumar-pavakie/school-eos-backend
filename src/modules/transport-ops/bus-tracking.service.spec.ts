// Orchestration-level tests against mocked services/repositories, matching this
// codebase's established convention (e.g. messaging.service.spec.ts). Real SQL
// join correctness is only meaningfully verified against a real Postgres query,
// not mocked here.

import { BusTrackingService } from './bus-tracking.service';

const VEHICLE = {
  id: 'vehicle-1',
  registrationNo: 'TN59-BZ-1000',
  model: 'Falcon',
};
const ROUTE = { id: 'route-1', name: 'Route A', code: 'A' };
const DRIVER = { id: 'driver-1', fullName: 'Ramesh Kumar' };
const ASSIGNMENT = {
  id: 'assignment-1',
  vehicleId: 'vehicle-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

function buildService(
  opts: {
    vehicles?: (typeof VEHICLE)[];
    telemetryFleet?: {
      vehicleId: string;
      recordedAt: Date;
      latitude: string;
      longitude: string;
      speedKmph: string | null;
      heading: number | null;
    }[];
    tripsFleet?: {
      id: string;
      assignmentId: string;
      tripDate: string;
      direction: string;
      state: string;
      startedAt: Date | null;
      completedAt: Date | null;
    }[];
    assignments?: (typeof ASSIGNMENT)[];
    telemetry?: {
      vehicleId: string;
      recordedAt: Date;
      latitude: string;
      longitude: string;
      speedKmph: string | null;
      heading: number | null;
    } | null;
    trips?: {
      id: string;
      assignmentId: string;
      tripDate: string;
      direction: string;
      state: string;
      startedAt: Date | null;
      completedAt: Date | null;
    }[];
    lastBoardingStop?: {
      routeStopId: string;
      stopName: string;
      sequenceNo: number;
      recordedAt: Date;
    } | null;
    nextStop?: {
      routeStopId: string;
      stopName: string;
      sequenceNo: number;
    } | null;
  } = {},
) {
  const vehiclesService = {
    get: jest.fn().mockResolvedValue(VEHICLE),
    list: jest.fn().mockResolvedValue(opts.vehicles ?? [VEHICLE]),
  } as any;
  const routesService = { get: jest.fn().mockResolvedValue(ROUTE) } as any;
  const driversService = { get: jest.fn().mockResolvedValue(DRIVER) } as any;
  const assignmentsService = {
    list: jest.fn().mockResolvedValue(opts.assignments ?? [ASSIGNMENT]),
  } as any;
  const busTrackingRepo = {
    findLatestTelemetry: jest
      .fn()
      .mockResolvedValue(opts.telemetry === undefined ? null : opts.telemetry),
    findLatestForVehicles: jest
      .fn()
      .mockResolvedValue(opts.telemetryFleet ?? []),
    findTripsForAssignmentDate: jest.fn().mockResolvedValue(opts.trips ?? []),
    findTripsForAssignmentsDate: jest
      .fn()
      .mockResolvedValue(opts.tripsFleet ?? []),
    findLastBoardingStop: jest
      .fn()
      .mockResolvedValue(
        opts.lastBoardingStop === undefined ? null : opts.lastBoardingStop,
      ),
    findNextStop: jest
      .fn()
      .mockResolvedValue(opts.nextStop === undefined ? null : opts.nextStop),
  } as any;

  const service = new BusTrackingService(
    vehiclesService,
    routesService,
    driversService,
    assignmentsService,
    busTrackingRepo,
  );

  return {
    service,
    vehiclesService,
    routesService,
    driversService,
    assignmentsService,
    busTrackingRepo,
  };
}

describe('BusTrackingService', () => {
  it('resolves vehicle/route/driver from the current vehicle-route assignment', async () => {
    const { service, assignmentsService, routesService, driversService } =
      buildService();
    const result = await service.getTracking('vehicle-1', undefined);

    expect(assignmentsService.list).toHaveBeenCalledWith({
      vehicleId: 'vehicle-1',
      currentOnly: true,
    });
    expect(routesService.get).toHaveBeenCalledWith('route-1');
    expect(driversService.get).toHaveBeenCalledWith('driver-1');
    expect(result.vehicle).toEqual(VEHICLE);
    expect(result.route).toEqual(ROUTE);
    expect(result.driver).toEqual(DRIVER);
  });

  it('a vehicle with no current assignment has null route/driver, never a fabricated one', async () => {
    const { service, routesService, driversService } = buildService({
      assignments: [],
    });
    const result = await service.getTracking('vehicle-1', undefined);
    expect(result.route).toBeNull();
    expect(result.driver).toBeNull();
    expect(routesService.get).not.toHaveBeenCalled();
    expect(driversService.get).not.toHaveBeenCalled();
  });

  it('recent telemetry (within the freshness threshold) is reported LIVE with the real coordinates', async () => {
    const { service } = buildService({
      telemetry: {
        vehicleId: 'vehicle-1',
        recordedAt: new Date(Date.now() - 30_000),
        latitude: '11.016800',
        longitude: '76.955800',
        speedKmph: '32.50',
        heading: 180,
      },
    });
    const result = await service.getTracking('vehicle-1', undefined);
    expect(result.freshness).toBe('LIVE');
    expect(result.telemetry?.latitude).toBe('11.016800');
    expect(result.telemetry?.longitude).toBe('76.955800');
  });

  it('old telemetry (older than the freshness threshold) is reported STALE, never LIVE', async () => {
    const { service } = buildService({
      telemetry: {
        vehicleId: 'vehicle-1',
        recordedAt: new Date(Date.now() - 10 * 60 * 1000),
        latitude: '11.0',
        longitude: '76.9',
        speedKmph: null,
        heading: null,
      },
    });
    const result = await service.getTracking('vehicle-1', undefined);
    expect(result.freshness).toBe('STALE');
  });

  it('a vehicle with zero telemetry rows is reported NO_DATA, never a fabricated position', async () => {
    const { service } = buildService({ telemetry: null });
    const result = await service.getTracking('vehicle-1', undefined);
    expect(result.freshness).toBe('NO_DATA');
    expect(result.telemetry).toBeNull();
  });

  it('last known stop and next stop are derived only from a real recorded boarding event, never GPS-distance math', async () => {
    const trip = {
      id: 'trip-1',
      assignmentId: 'assignment-1',
      tripDate: '2026-09-08',
      direction: 'PICKUP',
      state: 'IN_PROGRESS',
      startedAt: new Date(),
      completedAt: null,
    };
    const { service, busTrackingRepo } = buildService({
      trips: [trip],
      lastBoardingStop: {
        routeStopId: 'stop-1',
        stopName: 'Peelamedu',
        sequenceNo: 3,
        recordedAt: new Date('2026-09-08T06:27:00Z'),
      },
      nextStop: {
        routeStopId: 'stop-2',
        stopName: 'Singanallur',
        sequenceNo: 4,
      },
    });
    const result = await service.getTracking('vehicle-1', '2026-09-08');

    expect(busTrackingRepo.findNextStop).toHaveBeenCalledWith('route-1', 3);
    expect(result.lastKnownStop).toEqual({
      stopName: 'Peelamedu',
      recordedAt: '2026-09-08T06:27:00.000Z',
    });
    expect(result.nextStop).toEqual({ stopName: 'Singanallur' });
    expect(result.trip?.id).toBe('trip-1');
  });

  it('no trip for the bus/date -> trip, lastKnownStop, and nextStop are all null, never invented', async () => {
    const { service, busTrackingRepo } = buildService({ trips: [] });
    const result = await service.getTracking('vehicle-1', '2026-09-08');
    expect(result.trip).toBeNull();
    expect(result.lastKnownStop).toBeNull();
    expect(result.nextStop).toBeNull();
    expect(busTrackingRepo.findLastBoardingStop).not.toHaveBeenCalled();
  });

  it('a trip with no boarding events yet has a null lastKnownStop/nextStop, not a guess', async () => {
    const trip = {
      id: 'trip-1',
      assignmentId: 'assignment-1',
      tripDate: '2026-09-08',
      direction: 'PICKUP',
      state: 'SCHEDULED',
      startedAt: null,
      completedAt: null,
    };
    const { service, busTrackingRepo } = buildService({
      trips: [trip],
      lastBoardingStop: null,
    });
    const result = await service.getTracking('vehicle-1', '2026-09-08');
    expect(result.lastKnownStop).toBeNull();
    expect(result.nextStop).toBeNull();
    expect(busTrackingRepo.findNextStop).not.toHaveBeenCalled();
  });

  describe('listFleet', () => {
    it("returns one tracking summary per vehicle, resolving each one's own current assignment", async () => {
      const { service, vehiclesService, assignmentsService } = buildService({
        vehicles: [VEHICLE],
        telemetryFleet: [
          {
            vehicleId: 'vehicle-1',
            recordedAt: new Date(Date.now() - 30_000),
            latitude: '11.0',
            longitude: '76.9',
            speedKmph: '20',
            heading: 90,
          },
        ],
      });
      const result = await service.listFleet(undefined);

      expect(vehiclesService.list).toHaveBeenCalled();
      expect(assignmentsService.list).toHaveBeenCalledWith({
        currentOnly: true,
      });
      expect(result).toHaveLength(1);
      expect(result[0].vehicle).toEqual(VEHICLE);
      expect(result[0].route).toEqual(ROUTE);
      expect(result[0].driver).toEqual(DRIVER);
      expect(result[0].freshness).toBe('LIVE');
    });

    it('a vehicle with zero telemetry rows still appears, with NO_DATA and null telemetry, never a fabricated position', async () => {
      const { service } = buildService({
        vehicles: [VEHICLE],
        telemetryFleet: [],
      });
      const result = await service.listFleet(undefined);
      expect(result[0].freshness).toBe('NO_DATA');
      expect(result[0].telemetry).toBeNull();
    });

    it('a vehicle with no current assignment has null route/driver/trip, never a fabricated one', async () => {
      const { service } = buildService({
        vehicles: [VEHICLE],
        assignments: [],
      });
      const result = await service.listFleet(undefined);
      expect(result[0].route).toBeNull();
      expect(result[0].driver).toBeNull();
      expect(result[0].trip).toBeNull();
    });

    it("today's real trip for the assignment is attached to the right vehicle", async () => {
      const trip = {
        id: 'trip-1',
        assignmentId: 'assignment-1',
        tripDate: '2026-09-08',
        direction: 'PICKUP',
        state: 'IN_PROGRESS',
        startedAt: new Date(),
        completedAt: null,
      };
      const { service } = buildService({
        vehicles: [VEHICLE],
        tripsFleet: [trip],
      });
      const result = await service.listFleet('2026-09-08');
      expect(result[0].trip?.id).toBe('trip-1');
    });
  });
});
