// Read-only student boarding monitor for one bus. The status precedence is
// exactly the product requirement's rule, applied in this order and never
// reversed:
//   1. A real BOARDED/DROPPED student_trip_status row -> ENTERED (real event
//      time), full stop -- this always wins, even over an approved leave
//      (a student who boarded despite having leave on file is still ENTERED).
//   2. Otherwise, an APPROVED student_leave_request covering the trip date ->
//      ABSENT (with the real leave reason).
//   3. Otherwise -> NOT_ENTERED.
// Never inferred from "no NFC tap" alone, never from trip/route state.

import { Injectable } from '@nestjs/common';
import { RoutesService } from '../transport/routes.service';
import { VehicleRouteAssignmentsService } from '../transport/vehicle-route-assignments.service';
import { VehiclesService } from '../transport/vehicles.service';
import { BusTrackingRepository } from './repositories/bus-tracking.repository';
import { BoardingMonitorRepository } from './repositories/boarding-monitor.repository';
import { pickCurrentAssignment } from './current-assignment.util';

export type BoardingStatus = 'ENTERED' | 'NOT_ENTERED';
export type LeaveStatus = 'APPROVED' | 'NONE';
export type FinalStatus = 'ENTERED' | 'ABSENT' | 'NOT_ENTERED';

export interface StudentBoardingRow {
  studentId: string;
  studentName: string;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  stopName: string;
  boardingStatus: BoardingStatus;
  boardingTime: string | null;
  leaveStatus: LeaveStatus;
  leaveReason: string | null;
  finalStatus: FinalStatus;
}

export interface BoardingMonitorResult {
  route: { id: string; name: string } | null;
  trip: {
    id: string;
    direction: string;
    state: string;
    tripDate: string;
  } | null;
  students: StudentBoardingRow[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class BoardingMonitorService {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly routesService: RoutesService,
    private readonly assignmentsService: VehicleRouteAssignmentsService,
    private readonly busTrackingRepo: BusTrackingRepository,
    private readonly boardingMonitorRepo: BoardingMonitorRepository,
  ) {}

  async getBoardingMonitor(
    vehicleId: string,
    date: string | undefined,
  ): Promise<BoardingMonitorResult> {
    await this.vehiclesService.get(vehicleId);
    const tripDate = date ?? todayIso();

    const assignments = await this.assignmentsService.list({
      vehicleId,
      currentOnly: true,
    });
    const assignment = pickCurrentAssignment(assignments);
    if (!assignment) {
      return { route: null, trip: null, students: [] };
    }

    const route = await this.routesService.get(assignment.routeId);
    const trips = await this.busTrackingRepo.findTripsForAssignmentDate(
      assignment.id,
      tripDate,
    );
    const trip = trips[0] ?? null;

    const studentsOnRoute =
      await this.boardingMonitorRepo.findActiveStudentsForRoute(route.id);
    const studentIds = studentsOnRoute.map((s) => s.studentId);

    const [tripStatuses, approvedLeaves] = await Promise.all([
      trip
        ? this.boardingMonitorRepo.findTripStatusForTrip(trip.id, studentIds)
        : Promise.resolve([]),
      this.boardingMonitorRepo.findApprovedLeaves(studentIds, tripDate),
    ]);
    const tripStatusByStudent = new Map(
      tripStatuses.map((t) => [t.studentId, t]),
    );
    const approvedLeaveByStudent = new Map(
      approvedLeaves.map((l) => [l.studentId, l]),
    );

    const students: StudentBoardingRow[] = studentsOnRoute.map((s) => {
      const tripStatus = tripStatusByStudent.get(s.studentId);
      const boarded =
        tripStatus?.status === 'BOARDED' || tripStatus?.status === 'DROPPED';
      const leave = approvedLeaveByStudent.get(s.studentId);

      const boardingStatus: BoardingStatus = boarded
        ? 'ENTERED'
        : 'NOT_ENTERED';
      const leaveStatus: LeaveStatus = leave ? 'APPROVED' : 'NONE';
      // The precedence: a real boarding event always wins over an approved
      // leave on file (see file header) -- never reversed.
      const finalStatus: FinalStatus = boarded
        ? 'ENTERED'
        : leave
          ? 'ABSENT'
          : 'NOT_ENTERED';

      return {
        studentId: s.studentId,
        studentName: `${s.firstName} ${s.lastName ?? ''}`.trim(),
        admissionNo: s.admissionNo,
        gradeName: s.gradeName,
        sectionName: s.sectionName,
        stopName: s.stopName,
        boardingStatus,
        boardingTime: tripStatus?.boardedAt?.toISOString() ?? null,
        leaveStatus,
        leaveReason: leave?.reason ?? null,
        finalStatus,
      };
    });

    return {
      route: { id: route.id, name: route.name },
      trip: trip
        ? {
            id: trip.id,
            direction: trip.direction,
            state: trip.state,
            tripDate: trip.tripDate,
          }
        : null,
      students,
    };
  }
}
