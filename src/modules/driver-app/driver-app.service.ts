import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import {
  DriverRepository,
  type DriverRow,
} from '../transport/repositories/driver.repository';
import { VehicleRouteAssignmentRepository } from '../transport/repositories/vehicle-route-assignment.repository';
import { isUniqueViolation } from './pg-error.util';
import {
  DriverAppRepository,
  type MyBusRow,
  type MyStudentRow,
  type TripDirection,
} from './repositories/driver-app.repository';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class DriverAppService {
  constructor(
    private readonly driverRepo: DriverRepository,
    private readonly assignmentRepo: VehicleRouteAssignmentRepository,
    private readonly driverAppRepo: DriverAppRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  /** Resolves the caller's OWN driver row and current route assignment --
   * never a client-supplied driver/route/vehicle id anywhere in this module.
   * Throws NotFoundException (not a leaky 403) if this person has no driver
   * record or no current assignment -- both are real, honest "nothing to
   * show yet" states, not authorization failures. */
  private async resolveCurrentAssignment(personId: string) {
    const driver = await this.driverRepo.findByPersonId(personId);
    if (!driver)
      throw new NotFoundException('No driver record linked to this account.');

    const assignments = await this.assignmentRepo.findMany({
      driverId: driver.id,
      currentOnly: true,
    });
    const assignment = assignments[0] ?? null;
    if (!assignment)
      throw new NotFoundException(
        'No current bus/route assignment for this driver.',
      );

    return { driver, assignment };
  }

  /** The driver's own record -- licence/verification expiry, blood group,
   * experience -- same real driver table Transport Manager's own crew-card
   * screen already reads, just scoped to the caller's own row. */
  async getMyProfile(personId: string): Promise<DriverRow> {
    const driver = await this.driverRepo.findByPersonId(personId);
    if (!driver)
      throw new NotFoundException('No driver record linked to this account.');
    return driver;
  }

  async getMyBus(personId: string): Promise<MyBusRow> {
    const { assignment } = await this.resolveCurrentAssignment(personId);
    const bus = await this.driverAppRepo.findMyBus(assignment.id);
    if (!bus)
      throw new NotFoundException('No vehicle found for this assignment.');
    return bus;
  }

  async getMyStudents(
    personId: string,
    direction: TripDirection,
  ): Promise<MyStudentRow[]> {
    const { assignment } = await this.resolveCurrentAssignment(personId);
    return this.driverAppRepo.findMyStudents(
      assignment.routeId,
      today(),
      direction,
    );
  }

  /** Single aggregated read for the Home dashboard -- composes the same real
   * repository calls the other endpoints already use (no new SQL): today's
   * trip state for both directions, attendance-marking progress for both
   * directions, the bus/route summary, and the driver's own compliance
   * (licence/verification expiry) fields. One round trip instead of four
   * separate screen-level calls. */
  async getDashboard(personId: string): Promise<{
    profile: DriverRow;
    bus: MyBusRow | null;
    trips: Record<TripDirection, { state: string } | null>;
    attendance: Record<TripDirection, { marked: number; total: number }>;
  }> {
    const { driver, assignment } =
      await this.resolveCurrentAssignment(personId);
    const tripDate = today();

    const [bus, pickupTrip, dropTrip, pickupStudents, dropStudents] =
      await Promise.all([
        this.driverAppRepo.findMyBus(assignment.id),
        this.driverAppRepo.findTodaysTrip(assignment.id, tripDate, 'PICKUP'),
        this.driverAppRepo.findTodaysTrip(assignment.id, tripDate, 'DROP'),
        this.driverAppRepo.findMyStudents(
          assignment.routeId,
          tripDate,
          'PICKUP',
        ),
        this.driverAppRepo.findMyStudents(assignment.routeId, tripDate, 'DROP'),
      ]);

    return {
      profile: driver,
      bus,
      trips: {
        PICKUP: pickupTrip ? { state: pickupTrip.state } : null,
        DROP: dropTrip ? { state: dropTrip.state } : null,
      },
      attendance: {
        PICKUP: {
          marked: pickupStudents.filter((s) => s.markedToday).length,
          total: pickupStudents.length,
        },
        DROP: {
          marked: dropStudents.filter((s) => s.markedToday).length,
          total: dropStudents.length,
        },
      },
    };
  }

  /** Explicit "Start Trip" -- creates today's trip for this direction if the
   * external NFC pipeline hasn't already (STARTED immediately, since the
   * driver is confirming the trip is genuinely beginning now), or advances
   * an existing SCHEDULED trip to STARTED. Rejects starting a trip that's
   * already IN_PROGRESS/COMPLETED -- those are real terminal-ish states, not
   * something "start" should silently no-op past. */
  async startTrip(
    personId: string,
    direction: TripDirection,
  ): Promise<{ tripId: string; state: string }> {
    const { assignment } = await this.resolveCurrentAssignment(personId);
    const tripDate = today();

    let trip = await this.driverAppRepo.findTodaysTrip(
      assignment.id,
      tripDate,
      direction,
    );
    if (!trip) {
      trip = await this.driverAppRepo.createTrip(
        assignment.id,
        tripDate,
        direction,
        'STARTED',
        personId,
      );
    } else if (trip.state === 'SCHEDULED') {
      await this.driverAppRepo.updateTripState(trip.id, 'STARTED', personId);
      trip = { ...trip, state: 'STARTED' };
    } else if (trip.state === 'COMPLETED' || trip.state === 'CANCELLED') {
      throw new ConflictException(
        `Today's ${direction.toLowerCase()} trip is already ${trip.state.toLowerCase()}.`,
      );
    }
    // STARTED/IN_PROGRESS already -- idempotent, just return the real state.

    await this.auditService.record({
      actorPersonId: personId,
      action: 'DRIVER_STARTED_TRIP',
      objectType: 'trip',
      objectId: trip.id,
      outcome: 'SUCCESS',
    });

    return { tripId: trip.id, state: trip.state };
  }

  /** Explicit "Complete Trip" -- only the trip's own started_by driver (or a
   * later assignment holder, resolved the same way as every other call in
   * this service -- never a client-supplied trip id path) can complete it. */
  async completeTrip(
    personId: string,
    direction: TripDirection,
  ): Promise<{ tripId: string; state: string }> {
    const { assignment } = await this.resolveCurrentAssignment(personId);
    const tripDate = today();

    const trip = await this.driverAppRepo.findTodaysTrip(
      assignment.id,
      tripDate,
      direction,
    );
    if (!trip)
      throw new NotFoundException(
        `No ${direction.toLowerCase()} trip has been started today.`,
      );
    if (trip.state === 'COMPLETED') {
      return { tripId: trip.id, state: trip.state };
    }

    await this.driverAppRepo.updateTripState(trip.id, 'COMPLETED', null);

    await this.auditService.record({
      actorPersonId: personId,
      action: 'DRIVER_COMPLETED_TRIP',
      objectType: 'trip',
      objectId: trip.id,
      outcome: 'SUCCESS',
    });

    return { tripId: trip.id, state: 'COMPLETED' };
  }

  async markStudents(
    personId: string,
    direction: TripDirection,
    studentIds: string[],
  ): Promise<{ markedCount: number }> {
    const { driver, assignment } =
      await this.resolveCurrentAssignment(personId);
    const tripDate = today();

    // Never trust the client's studentIds blindly -- only students genuinely
    // allocated to THIS driver's own route/stop today, in this direction,
    // can be marked. Any requested id that isn't in that real list is
    // rejected outright rather than silently dropped (silently dropping
    // would let a caller probe which ids are valid).
    const myStudents = await this.driverAppRepo.findMyStudents(
      assignment.routeId,
      tripDate,
      direction,
    );
    const validStopByStudentId = new Map(
      myStudents.map((s) => [s.studentId, s.routeStopId]),
    );
    const unauthorized = studentIds.filter(
      (id) => !validStopByStudentId.has(id),
    );
    if (unauthorized.length > 0) {
      throw new ForbiddenException(
        "One or more students are not on this driver's own route.",
      );
    }

    const routeStopIdByStudentId = new Map(
      studentIds.map((id) => [id, validStopByStudentId.get(id)!]),
    );

    const markedCount = await this.unitOfWork.run(async (client) => {
      let trip = await this.driverAppRepo.findTodaysTrip(
        assignment.id,
        tripDate,
        direction,
        client,
      );
      if (!trip) {
        trip = await this.driverAppRepo.createTrip(
          assignment.id,
          tripDate,
          direction,
          'STARTED',
          personId,
          client,
        );
      }
      return this.driverAppRepo.markStudents(
        trip.id,
        direction,
        routeStopIdByStudentId,
        personId,
        client,
      );
    });

    await this.auditService.record({
      actorPersonId: personId,
      action: 'DRIVER_MARKED_ATTENDANCE',
      objectType: 'bus_boarding_event',
      objectId: assignment.id,
      outcome: 'SUCCESS',
      afterData: { driverId: driver.id, studentIds, direction, tripDate },
    });

    return { markedCount };
  }

  /** "Undo a wrongly-marked Present" -- a driver under pressure taps the
   * wrong student, and bus_boarding_event's own real append-only trigger
   * (trg_boarding_immutable) makes a plain UPDATE/DELETE impossible; this
   * records a correction instead, exactly the same shape as classroom
   * attendance's own real attendance_correction pattern. Deliberately
   * narrow: only voids the driver's OWN 'DRIVER_MANUAL' mark, for this
   * exact student/direction/today -- never an NFC ('CARD_TAP') or
   * attendant-marked event, and never a mark from a previous day or a
   * different driver's own manual mark. Those are real data belonging to a
   * different actor/authorization level, not this fallback's job to touch. */
  async undoMark(
    personId: string,
    direction: TripDirection,
    studentId: string,
  ): Promise<void> {
    const { driver } = await this.resolveCurrentAssignment(personId);
    const tripDate = today();

    const event = await this.driverAppRepo.findOwnVoidableMark(
      personId,
      studentId,
      tripDate,
      direction,
    );
    if (!event) {
      throw new NotFoundException(
        'No manual mark of yours found for this student today -- it may already be undone, or it was recorded by NFC/an attendant instead.',
      );
    }

    try {
      await this.driverAppRepo.voidBoardingEvent(event.id, personId, null);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('This mark was already undone.');
      }
      throw err;
    }

    await this.auditService.record({
      actorPersonId: personId,
      action: 'DRIVER_UNDID_ATTENDANCE_MARK',
      objectType: 'bus_boarding_event',
      objectId: event.id,
      outcome: 'SUCCESS',
      afterData: { driverId: driver.id, studentId, direction, tripDate },
    });
  }
}
