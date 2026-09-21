import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type TripDirection = 'PICKUP' | 'DROP';

// IMPORTANT: every manual mark from this module is a BOARD event, for BOTH
// directions -- never ALIGHT. Confirmed via the real trg_boarding_order
// trigger (check_boarding_order()): an ALIGHT event requires an existing
// BOARD event on that SAME trip_id, i.e. BOARD/ALIGHT are two ends of one
// continuous leg (board at the stop, alight at school on a PICKUP trip;
// board at school, alight at the stop on a DROP trip), not "PICKUP trip =
// BOARD" and "DROP trip = ALIGHT" as two independent per-direction concepts.
// A manual attendance fallback's whole job is "confirm this student is
// accounted for on this trip" -- BOARD represents that correctly for either
// direction and has no precondition, so it's the only event type this
// module ever writes. Recording a student's actual ALIGHT (getting off) is
// a separate, more granular NFC-specific capability this fallback
// deliberately doesn't replicate.
const MANUAL_MARK_EVENT_DIRECTION = 'BOARD' as const;

export interface MyStudentRow {
  studentId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  routeStopId: string;
  stopName: string;
  sequenceNo: number;
  markedToday: boolean;
  /** 'CARD_TAP' | 'ATTENDANT_MANUAL' | 'DRIVER_MANUAL' | null (unmarked) --
   * only a DRIVER_MANUAL mark is ever eligible to be undone by this driver. */
  markedTodaySource: string | null;
}

export interface TripRow {
  id: string;
  assignmentId: string;
  tripDate: string;
  direction: string;
  state: string;
}

export interface MyBusRow {
  vehicleId: string;
  registrationNo: string;
  model: string | null;
  capacity: number | null;
  routeId: string;
  routeName: string;
  routeCode: string | null;
  attendantId: string | null;
  attendantName: string | null;
  attendantPhone: string | null;
}

@Injectable()
export class DriverAppRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every ACTIVE student allocated to a stop on this route for the current
   * academic year, in the given direction (PICKUP or BOTH for morning
   * boarding; DROP or BOTH for afternoon drop-off), plus whether they already
   * have a real BOARD bus_boarding_event today on a trip of this SAME
   * direction, so the driver's list reflects reality even if NFC already
   * caught some of them -- and so a PICKUP mark this morning never shows as
   * "already marked" on the DROP list this afternoon. A boarding event that
   * has a matching bus_boarding_correction row (a driver undid their own
   * wrongly-marked Present -- see voidBoardingEvent() below) is excluded
   * here, so the student correctly shows as unmarked again; the original
   * event row and the correction both stay in the table permanently
   * (append-only), only markedToday's derived truth changes.
   * markedTodaySource surfaces WHICH source produced the mark
   * (CARD_TAP/ATTENDANT_MANUAL/DRIVER_MANUAL) so the mobile UI can offer
   * "undo" only for the driver's own DRIVER_MANUAL marks -- undoMark() would
   * reject the others anyway, but showing the control at all for data that
   * isn't a driver's own to touch would be misleading. Ordered by stop
   * sequence, matching the route's own real physical order. */
  async findMyStudents(
    routeId: string,
    tripDate: string,
    direction: TripDirection,
    executor: Queryable = this.postgres,
  ): Promise<MyStudentRow[]> {
    const { rows } = await executor.query<{
      student_id: string;
      first_name: string;
      last_name: string | null;
      admission_no: string;
      grade_name: string | null;
      section_name: string | null;
      route_stop_id: string;
      stop_name: string;
      sequence_no: number;
      marked_today_source: string | null;
    }>(
      `SELECT s.id AS student_id, p.first_name, p.last_name, s.admission_no,
              g.name AS grade_name, sec.name AS section_name,
              rs.id AS route_stop_id, rs.stop_name, rs.sequence_no,
              (
                SELECT be.source FROM bus_boarding_event be
                JOIN trip t ON t.id = be.trip_id
                WHERE be.student_id = s.id AND be.direction = $3
                  AND t.trip_date = $2 AND t.direction = $4
                  AND NOT EXISTS (
                    SELECT 1 FROM bus_boarding_correction bc WHERE bc.boarding_event_id = be.id
                  )
                ORDER BY be.recorded_at DESC
                LIMIT 1
              ) AS marked_today_source
       FROM student_transport_allocation sta
       JOIN route_stop rs ON rs.id = sta.route_stop_id
       JOIN student s ON s.id = sta.student_id
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       WHERE rs.route_id = $1
         AND sta.status = 'ACTIVE'
         AND sta.direction IN ($4, 'BOTH')
         AND sta.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         AND s.status = 'ACTIVE'
       ORDER BY rs.sequence_no, p.first_name`,
      [routeId, tripDate, MANUAL_MARK_EVENT_DIRECTION, direction],
    );
    return rows.map((r) => ({
      studentId: r.student_id,
      firstName: r.first_name,
      lastName: r.last_name,
      admissionNo: r.admission_no,
      gradeName: r.grade_name,
      sectionName: r.section_name,
      routeStopId: r.route_stop_id,
      stopName: r.stop_name,
      sequenceNo: r.sequence_no,
      markedToday: r.marked_today_source !== null,
      markedTodaySource: r.marked_today_source,
    }));
  }

  /** Today's trip for this vehicle_route_assignment + direction, if the
   * external NFC pipeline (or an earlier driver-marked entry, or an explicit
   * driver-started trip) already created one. */
  async findTodaysTrip(
    assignmentId: string,
    tripDate: string,
    direction: TripDirection,
    executor: Queryable = this.postgres,
  ): Promise<TripRow | null> {
    const { rows } = await executor.query<{
      id: string;
      assignment_id: string;
      trip_date: string;
      direction: string;
      state: string;
    }>(
      `SELECT id, assignment_id, trip_date, direction, state
       FROM trip
       WHERE assignment_id = $1 AND trip_date = $2 AND direction = $3
       LIMIT 1`,
      [assignmentId, tripDate, direction],
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          assignmentId: row.assignment_id,
          tripDate: row.trip_date,
          direction: row.direction,
          state: row.state,
        }
      : null;
  }

  /** Creates today's trip for this direction. state starts 'SCHEDULED' when
   * created via the explicit "Start Trip" action (immediately flipped to
   * 'STARTED' by startTrip() in the same call) or directly 'STARTED' when
   * auto-created as a manual-boarding fallback (NFC never got the chance to
   * start one). started_by is the driver's own person_id, never a
   * fabricated "system" actor. */
  async createTrip(
    assignmentId: string,
    tripDate: string,
    direction: TripDirection,
    state: 'SCHEDULED' | 'STARTED',
    startedByPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<TripRow> {
    const { rows } = await executor.query<{
      id: string;
      assignment_id: string;
      trip_date: string;
      direction: string;
      state: string;
    }>(
      `INSERT INTO trip (assignment_id, trip_date, direction, state, started_at, started_by)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'STARTED' THEN now() ELSE NULL END, $5)
       RETURNING id, assignment_id, trip_date, direction, state`,
      [assignmentId, tripDate, direction, state, startedByPersonId],
    );
    const row = rows[0];
    return {
      id: row.id,
      assignmentId: row.assignment_id,
      tripDate: row.trip_date,
      direction: row.direction,
      state: row.state,
    };
  }

  /** Explicit trip lifecycle transitions -- reuses the trip table's own real
   * state machine (SCHEDULED/STARTED/IN_PROGRESS/COMPLETED/INTERRUPTED/
   * CANCELLED), no new status model. */
  async updateTripState(
    tripId: string,
    state: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED',
    startedByPersonId: string | null,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    if (state === 'STARTED') {
      await executor.query(
        `UPDATE trip SET state = $2, started_at = COALESCE(started_at, now()), started_by = COALESCE(started_by, $3) WHERE id = $1`,
        [tripId, state, startedByPersonId],
      );
    } else if (state === 'COMPLETED') {
      await executor.query(
        `UPDATE trip SET state = $2, completed_at = now() WHERE id = $1`,
        [tripId, state],
      );
    } else {
      await executor.query(`UPDATE trip SET state = $2 WHERE id = $1`, [
        tripId,
        state,
      ]);
    }
  }

  /** Real manual attendance events -- source='DRIVER_MANUAL' (see query.md's
   * ALTER on bus_boarding_event_source_check) distinguishes these from the
   * existing 'CARD_TAP'/'ATTENDANT_MANUAL' sources. attendant_person_id
   * stores the driver's own person_id -- same FK target (person), just a
   * different real actor. Always writes direction='BOARD' (see
   * MANUAL_MARK_EVENT_DIRECTION above) regardless of trip direction. Skips a
   * student already marked today on a trip of this SAME tripDirection --
   * scoped by t.direction, not just t.trip_date, so a PICKUP BOARD event
   * this morning never suppresses this afternoon's DROP mark for the same
   * student. */
  async markStudents(
    tripId: string,
    tripDirection: TripDirection,
    routeStopIdByStudentId: Map<string, string>,
    driverPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    let marked = 0;
    for (const [studentId, routeStopId] of routeStopIdByStudentId) {
      const { rowCount } = await executor.query(
        `INSERT INTO bus_boarding_event (trip_id, student_id, route_stop_id, direction, source, is_wrong_bus, attendant_person_id, recorded_at)
         SELECT $1, $2, $3, $5, 'DRIVER_MANUAL', false, $4, now()
         WHERE NOT EXISTS (
           SELECT 1 FROM bus_boarding_event be
           JOIN trip t ON t.id = be.trip_id
           WHERE be.student_id = $2 AND be.direction = $5
             AND t.trip_date = (SELECT trip_date FROM trip WHERE id = $1) AND t.direction = $6
             AND NOT EXISTS (
               SELECT 1 FROM bus_boarding_correction bc WHERE bc.boarding_event_id = be.id
             )
         )`,
        [
          tripId,
          studentId,
          routeStopId,
          driverPersonId,
          MANUAL_MARK_EVENT_DIRECTION,
          tripDirection,
        ],
      );
      marked += rowCount ?? 0;
    }
    return marked;
  }

  /** Real vehicle/route/attendant info for the driver's own current
   * assignment -- same real tables Parent's own ParentBusRepository reads
   * (registration_no/model/capacity, route name/code, attendant contact),
   * just scoped by the driver's own assignment instead of a student's
   * allocation. */
  async findMyBus(
    assignmentId: string,
    executor: Queryable = this.postgres,
  ): Promise<MyBusRow | null> {
    const { rows } = await executor.query<{
      vehicle_id: string;
      registration_no: string;
      model: string | null;
      capacity: number | null;
      route_id: string;
      route_name: string;
      route_code: string | null;
      attendant_id: string | null;
      attendant_name: string | null;
      attendant_phone: string | null;
    }>(
      `SELECT v.id AS vehicle_id, v.registration_no, v.model, v.capacity,
              r.id AS route_id, r.name AS route_name, r.code AS route_code,
              a.id AS attendant_id, a.full_name AS attendant_name, a.phone AS attendant_phone
       FROM vehicle_route_assignment vra
       JOIN vehicle v ON v.id = vra.vehicle_id
       JOIN route r ON r.id = vra.route_id
       LEFT JOIN attendant a ON a.id = vra.attendant_id
       WHERE vra.id = $1`,
      [assignmentId],
    );
    const row = rows[0];
    return row
      ? {
          vehicleId: row.vehicle_id,
          registrationNo: row.registration_no,
          model: row.model,
          capacity: row.capacity,
          routeId: row.route_id,
          routeName: row.route_name,
          routeCode: row.route_code,
          attendantId: row.attendant_id,
          attendantName: row.attendant_name,
          attendantPhone: row.attendant_phone,
        }
      : null;
  }

  /** Finds this driver's own, still-active (not already voided) manual mark
   * for this student today, on a trip of this exact direction -- the only
   * kind of boarding event a driver is ever allowed to void (see
   * driver-app.service.ts's undoMark() for the full authorization
   * reasoning). Returns null if no such event exists, it was already
   * voided, or it belongs to a different source (NFC/attendant). */
  async findOwnVoidableMark(
    driverPersonId: string,
    studentId: string,
    tripDate: string,
    direction: TripDirection,
    executor: Queryable = this.postgres,
  ): Promise<{ id: string } | null> {
    const { rows } = await executor.query<{ id: string }>(
      `SELECT be.id
       FROM bus_boarding_event be
       JOIN trip t ON t.id = be.trip_id
       WHERE be.student_id = $1
         AND be.direction = $4
         AND be.source = 'DRIVER_MANUAL'
         AND be.attendant_person_id = $2
         AND t.trip_date = $3
         AND t.direction = $5
         AND NOT EXISTS (
           SELECT 1 FROM bus_boarding_correction bc WHERE bc.boarding_event_id = be.id
         )
       LIMIT 1`,
      [
        studentId,
        driverPersonId,
        tripDate,
        MANUAL_MARK_EVENT_DIRECTION,
        direction,
      ],
    );
    return rows[0] ?? null;
  }

  /** Records a correction -- never touches the original bus_boarding_event
   * row (the append-only trigger would reject it anyway). The unique
   * constraint on boarding_event_id means a second void attempt on the same
   * event fails with a real 23505, translated to a clean 409 by the service
   * layer, not a silent double-void. */
  async voidBoardingEvent(
    boardingEventId: string,
    correctedByPersonId: string,
    reason: string | null,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO bus_boarding_correction (boarding_event_id, reason, corrected_by, corrected_at)
       VALUES ($1, $2, $3, now())`,
      [boardingEventId, reason, correctedByPersonId],
    );
  }
}
