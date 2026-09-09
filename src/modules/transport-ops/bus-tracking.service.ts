// Read-only bus tracking: resolves vehicle -> current route assignment ->
// route/driver, latest real telemetry (never fabricated), and -- only when
// resolvable from an actual recorded event -- the last known stop and the
// next stop in route sequence. No geofencing/GPS-distance math: "current
// stop" is only ever the stop of a real bus_boarding_event, never guessed
// from coordinates, matching the product requirement's explicit ban on
// inventing route deviation/geofencing in this phase.

import { Injectable } from '@nestjs/common';
import { DriversService } from '../transport/drivers.service';
import { RoutesService } from '../transport/routes.service';
import { VehicleRouteAssignmentsService } from '../transport/vehicle-route-assignments.service';
import { VehiclesService } from '../transport/vehicles.service';
import {
  BusTrackingRepository,
  LatestTelemetryRow,
  TripRow,
} from './repositories/bus-tracking.repository';
import { pickCurrentAssignment } from './current-assignment.util';

// No prior telemetry-freshness convention exists anywhere in this codebase
// (confirmed: zero other code reads telemetry_event) -- this threshold is
// newly established here, not reused from an existing constant.
const FRESH_THRESHOLD_SECONDS = 120;

export type TrackingFreshness = 'LIVE' | 'STALE' | 'NO_DATA';

export interface BusTrackingResult {
  vehicle: { id: string; registrationNo: string; model: string | null };
  route: { id: string; name: string; code: string | null } | null;
  driver: { id: string; fullName: string } | null;
  telemetry: {
    latitude: string;
    longitude: string;
    speedKmph: string | null;
    heading: number | null;
    recordedAt: string;
    ageSeconds: number;
  } | null;
  freshness: TrackingFreshness;
  trip: {
    id: string;
    direction: string;
    state: string;
    tripDate: string;
  } | null;
  lastKnownStop: { stopName: string; recordedAt: string } | null;
  nextStop: { stopName: string } | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class BusTrackingService {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly routesService: RoutesService,
    private readonly driversService: DriversService,
    private readonly assignmentsService: VehicleRouteAssignmentsService,
    private readonly busTrackingRepo: BusTrackingRepository,
  ) {}

  async getTracking(
    vehicleId: string,
    date: string | undefined,
  ): Promise<BusTrackingResult> {
    const vehicle = await this.vehiclesService.get(vehicleId);
    const tripDate = date ?? todayIso();

    const assignments = await this.assignmentsService.list({
      vehicleId,
      currentOnly: true,
    });
    const assignment = pickCurrentAssignment(assignments);

    const route = assignment
      ? await this.routesService.get(assignment.routeId)
      : null;
    const driver = assignment?.driverId
      ? await this.driversService.get(assignment.driverId)
      : null;

    const latest = await this.busTrackingRepo.findLatestTelemetry(vehicleId);
    const telemetry = latest ? this.toTelemetryView(latest) : null;
    const freshness = this.resolveFreshness(telemetry?.ageSeconds ?? null);

    const trips = assignment
      ? await this.busTrackingRepo.findTripsForAssignmentDate(
          assignment.id,
          tripDate,
        )
      : [];
    const trip = trips[0] ?? null;

    let lastKnownStop: BusTrackingResult['lastKnownStop'] = null;
    let nextStop: BusTrackingResult['nextStop'] = null;
    if (trip) {
      const lastStop = await this.busTrackingRepo.findLastBoardingStop(trip.id);
      if (lastStop) {
        lastKnownStop = {
          stopName: lastStop.stopName,
          recordedAt: lastStop.recordedAt.toISOString(),
        };
        if (route) {
          const next = await this.busTrackingRepo.findNextStop(
            route.id,
            lastStop.sequenceNo,
          );
          if (next) nextStop = { stopName: next.stopName };
        }
      }
    }

    return {
      vehicle: {
        id: vehicle.id,
        registrationNo: vehicle.registrationNo,
        model: vehicle.model,
      },
      route: route
        ? { id: route.id, name: route.name, code: route.code }
        : null,
      driver: driver ? { id: driver.id, fullName: driver.fullName } : null,
      telemetry,
      freshness,
      trip: trip
        ? {
            id: trip.id,
            direction: trip.direction,
            state: trip.state,
            tripDate: trip.tripDate,
          }
        : null,
      lastKnownStop,
      nextStop,
    };
  }

  /** Every vehicle's current tracking summary in one pass -- backs Live
   * Tracking's bus list/map and the Overview's live-bus-status tiles. Same
   * real telemetry/trip data as getTracking, just fleet-wide instead of one
   * vehicle at a time (fleet is small enough that per-vehicle driver/route
   * lookups stay a handful of calls, same style getTracking already uses). */
  async listFleet(date: string | undefined): Promise<BusTrackingResult[]> {
    const tripDate = date ?? todayIso();
    const [vehicles, assignments] = await Promise.all([
      this.vehiclesService.list(),
      this.assignmentsService.list({ currentOnly: true }),
    ]);

    const assignmentsByVehicle = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = assignmentsByVehicle.get(a.vehicleId) ?? [];
      list.push(a);
      assignmentsByVehicle.set(a.vehicleId, list);
    }

    const vehicleIds = vehicles.map((v: { id: string }) => v.id);
    const [telemetryRows, tripRows] = await Promise.all([
      this.busTrackingRepo.findLatestForVehicles(vehicleIds),
      this.busTrackingRepo.findTripsForAssignmentsDate(
        assignments.map((a: { id: string }) => a.id),
        tripDate,
      ),
    ]);
    const telemetryByVehicle = new Map(
      telemetryRows.map((t) => [t.vehicleId, t]),
    );
    const tripByAssignment = new Map<string, TripRow>();
    for (const trip of tripRows) {
      if (!tripByAssignment.has(trip.assignmentId)) {
        tripByAssignment.set(trip.assignmentId, trip);
      }
    }

    return Promise.all(
      vehicles.map(
        async (vehicle: {
          id: string;
          registrationNo: string;
          model: string | null;
        }) => {
          const assignment = pickCurrentAssignment(
            assignmentsByVehicle.get(vehicle.id) ?? [],
          );
          const route = assignment
            ? await this.routesService.get(assignment.routeId)
            : null;
          const driver = assignment?.driverId
            ? await this.driversService.get(assignment.driverId)
            : null;

          const latest = telemetryByVehicle.get(vehicle.id) ?? null;
          const telemetry = latest ? this.toTelemetryView(latest) : null;
          const freshness = this.resolveFreshness(
            telemetry?.ageSeconds ?? null,
          );
          const trip = assignment
            ? (tripByAssignment.get(assignment.id) ?? null)
            : null;

          return {
            vehicle: {
              id: vehicle.id,
              registrationNo: vehicle.registrationNo,
              model: vehicle.model,
            },
            route: route
              ? { id: route.id, name: route.name, code: route.code }
              : null,
            driver: driver
              ? { id: driver.id, fullName: driver.fullName }
              : null,
            telemetry,
            freshness,
            trip: trip
              ? {
                  id: trip.id,
                  direction: trip.direction,
                  state: trip.state,
                  tripDate: trip.tripDate,
                }
              : null,
            lastKnownStop: null,
            nextStop: null,
          };
        },
      ),
    );
  }

  private toTelemetryView(row: LatestTelemetryRow) {
    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - row.recordedAt.getTime()) / 1000),
    );
    return {
      latitude: row.latitude,
      longitude: row.longitude,
      speedKmph: row.speedKmph,
      heading: row.heading,
      recordedAt: row.recordedAt.toISOString(),
      ageSeconds,
    };
  }

  private resolveFreshness(ageSeconds: number | null): TrackingFreshness {
    if (ageSeconds === null) return 'NO_DATA';
    return ageSeconds <= FRESH_THRESHOLD_SECONDS ? 'LIVE' : 'STALE';
  }
}
