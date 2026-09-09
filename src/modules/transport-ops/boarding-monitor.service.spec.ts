// Orchestration-level tests against mocked services/repositories. The status
// precedence (boarded always wins over an approved leave; a leave never
// becomes Absent without an APPROVED leave on file; a missing NFC tap alone is
// never treated as Absent) is the single most important behavior in this file.

import { BoardingMonitorService } from './boarding-monitor.service';

const ROUTE = { id: 'route-1', name: 'Route A', code: 'A' };
const ASSIGNMENT = {
  id: 'assignment-1',
  vehicleId: 'vehicle-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};
const TRIP = {
  id: 'trip-1',
  assignmentId: 'assignment-1',
  tripDate: '2026-09-08',
  direction: 'PICKUP',
  state: 'IN_PROGRESS',
  startedAt: new Date(),
  completedAt: null,
};

const STUDENT_A = {
  studentId: 'student-a',
  firstName: 'Naveen',
  lastName: 'Rangaswamy',
  admissionNo: 'SMS20250011',
  gradeName: 'Standard 2',
  sectionName: 'A',
  routeStopId: 'stop-1',
  stopName: 'Peelamedu',
  direction: 'BOTH',
};
const STUDENT_B = {
  ...STUDENT_A,
  studentId: 'student-b',
  firstName: 'Diya',
  lastName: 'Kumar',
};

function buildService(
  opts: {
    assignments?: (typeof ASSIGNMENT)[];
    trips?: (typeof TRIP)[];
    students?: (typeof STUDENT_A)[];
    tripStatuses?: {
      studentId: string;
      status: string;
      boardedAt: Date | null;
      droppedAt: Date | null;
    }[];
    approvedLeaves?: {
      studentId: string;
      reason: string;
      fromDate: string;
      toDate: string;
    }[];
  } = {},
) {
  const vehiclesService = {
    get: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
  } as any;
  const routesService = { get: jest.fn().mockResolvedValue(ROUTE) } as any;
  const assignmentsService = {
    list: jest.fn().mockResolvedValue(opts.assignments ?? [ASSIGNMENT]),
  } as any;
  const busTrackingRepo = {
    findTripsForAssignmentDate: jest
      .fn()
      .mockResolvedValue(opts.trips ?? [TRIP]),
  } as any;
  const boardingMonitorRepo = {
    findActiveStudentsForRoute: jest
      .fn()
      .mockResolvedValue(opts.students ?? [STUDENT_A]),
    findTripStatusForTrip: jest.fn().mockResolvedValue(opts.tripStatuses ?? []),
    findApprovedLeaves: jest.fn().mockResolvedValue(opts.approvedLeaves ?? []),
  } as any;

  const service = new BoardingMonitorService(
    vehiclesService,
    routesService,
    assignmentsService,
    busTrackingRepo,
    boardingMonitorRepo,
  );

  return { service, assignmentsService, boardingMonitorRepo, busTrackingRepo };
}

describe('BoardingMonitorService', () => {
  it('a vehicle with no current route assignment returns an honest empty result, never invented students', async () => {
    const { service, boardingMonitorRepo } = buildService({ assignments: [] });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    expect(result).toEqual({ route: null, trip: null, students: [] });
    expect(
      boardingMonitorRepo.findActiveStudentsForRoute,
    ).not.toHaveBeenCalled();
  });

  it('only students with an ACTIVE allocation on this route are returned -- the query is scoped to route-1', async () => {
    const { service, boardingMonitorRepo } = buildService();
    await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    expect(boardingMonitorRepo.findActiveStudentsForRoute).toHaveBeenCalledWith(
      'route-1',
    );
  });

  it('a real BOARDED student_trip_status -> ENTERED, with the real event time, boarding status independent of any leave', async () => {
    const { service } = buildService({
      tripStatuses: [
        {
          studentId: 'student-a',
          status: 'BOARDED',
          boardedAt: new Date('2026-09-08T06:27:00Z'),
          droppedAt: null,
        },
      ],
    });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    const row = result.students[0]!;
    expect(row.boardingStatus).toBe('ENTERED');
    expect(row.boardingTime).toBe('2026-09-08T06:27:00.000Z');
    expect(row.finalStatus).toBe('ENTERED');
  });

  it('a DROPPED student_trip_status also counts as boarded -> ENTERED (they were on the bus)', async () => {
    const { service } = buildService({
      tripStatuses: [
        {
          studentId: 'student-a',
          status: 'DROPPED',
          boardedAt: new Date('2026-09-08T06:27:00Z'),
          droppedAt: new Date('2026-09-08T07:10:00Z'),
        },
      ],
    });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    expect(result.students[0]!.finalStatus).toBe('ENTERED');
  });

  it('no boarding event + an APPROVED leave covering the date -> ABSENT with the real leave reason', async () => {
    const { service } = buildService({
      approvedLeaves: [
        {
          studentId: 'student-a',
          reason: 'Family function',
          fromDate: '2026-09-07',
          toDate: '2026-09-09',
        },
      ],
    });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    const row = result.students[0]!;
    expect(row.boardingStatus).toBe('NOT_ENTERED');
    expect(row.leaveStatus).toBe('APPROVED');
    expect(row.leaveReason).toBe('Family function');
    expect(row.finalStatus).toBe('ABSENT');
  });

  it('no boarding event + no approved leave -> NOT_ENTERED, never ABSENT merely from a missing tap', async () => {
    const { service } = buildService();
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    const row = result.students[0]!;
    expect(row.boardingStatus).toBe('NOT_ENTERED');
    expect(row.leaveStatus).toBe('NONE');
    expect(row.finalStatus).toBe('NOT_ENTERED');
  });

  it('a confirmed boarding event always wins over an approved leave on file -> ENTERED, never Absent (precedence never reversed)', async () => {
    const { service } = buildService({
      tripStatuses: [
        {
          studentId: 'student-a',
          status: 'BOARDED',
          boardedAt: new Date('2026-09-08T06:27:00Z'),
          droppedAt: null,
        },
      ],
      approvedLeaves: [
        {
          studentId: 'student-a',
          reason: 'Family function',
          fromDate: '2026-09-07',
          toDate: '2026-09-09',
        },
      ],
    });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    const row = result.students[0]!;
    expect(row.boardingStatus).toBe('ENTERED');
    expect(row.leaveStatus).toBe('APPROVED');
    expect(row.finalStatus).toBe('ENTERED');
  });

  it('each student on the route gets their own independent status -- one boarded, one not, never cross-contaminated', async () => {
    const { service } = buildService({
      students: [STUDENT_A, STUDENT_B],
      tripStatuses: [
        {
          studentId: 'student-a',
          status: 'BOARDED',
          boardedAt: new Date('2026-09-08T06:27:00Z'),
          droppedAt: null,
        },
      ],
      approvedLeaves: [
        {
          studentId: 'student-b',
          reason: 'Medical',
          fromDate: '2026-09-08',
          toDate: '2026-09-08',
        },
      ],
    });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    const byId = new Map(result.students.map((s) => [s.studentId, s]));
    expect(byId.get('student-a')!.finalStatus).toBe('ENTERED');
    expect(byId.get('student-b')!.finalStatus).toBe('ABSENT');
  });

  it('when there is no trip for the bus/date, students are still listed (from allocation) but with no boarding/status data fabricated', async () => {
    const { service, boardingMonitorRepo } = buildService({ trips: [] });
    const result = await service.getBoardingMonitor('vehicle-1', '2026-09-08');
    expect(result.trip).toBeNull();
    expect(boardingMonitorRepo.findTripStatusForTrip).not.toHaveBeenCalled();
    expect(result.students[0]!.finalStatus).toBe('NOT_ENTERED');
  });
});
