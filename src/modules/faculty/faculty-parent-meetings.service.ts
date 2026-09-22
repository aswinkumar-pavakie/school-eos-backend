// Parent Meetings -- faculty creates real bookable slots (date + from/to
// time), full CRUD; a parent's booking request reaches the faculty, who
// approves/rejects (a plain ownership check, not the generic approvals
// engine -- there's no role-chain here, just "the slot's own creator
// decides"). Booking creation itself is the Parent app's own real feature,
// out of scope for polish -- this only provides the minimal, still fully
// guardian- and scope-checked creation path real test data needs to exist.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import {
  JoinCredentials,
  LiveKitService,
} from '../livekit/livekit.service';
import { CreateMeetingBookingDto } from './dto/create-meeting-booking.dto';
import { CreateMeetingSlotDto } from './dto/create-meeting-slot.dto';
import { UpdateMeetingSlotDto } from './dto/update-meeting-slot.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StaffMeetingRepository } from './repositories/staff-meeting.repository';

// Join window: open 5 minutes before the slot's own start time, closes 10
// minutes after its own end time -- a real grace window, not an arbitrary
// guess: early enough that neither party is stuck waiting at the exact
// second, generous enough at the end that a call running slightly over
// doesn't get cut off by this check (LiveKit itself, not this window, is
// what actually ends the call).
const JOIN_WINDOW_BEFORE_MINUTES = 5;
const JOIN_WINDOW_AFTER_MINUTES = 10;

@Injectable()
export class FacultyParentMeetingsService {
  constructor(
    private readonly meetingRepo: StaffMeetingRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly postgres: PostgresService,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
    private readonly liveKit: LiveKitService,
    private readonly outbox: OutboxService,
  ) {}

  async listSlots(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    const slots = await this.meetingRepo.findSlotsForStaff(staffId);
    const bookings = await this.meetingRepo.findBookingsForSlots(
      slots.map((s) => s.id),
    );
    return slots.map((slot) => ({
      ...slot,
      booking:
        bookings.find(
          (b) =>
            b.slotId === slot.id && ['PENDING', 'APPROVED'].includes(b.state),
        ) ?? null,
      pastBookings: bookings.filter(
        (b) => b.slotId === slot.id && b.state === 'REJECTED',
      ),
    }));
  }

  private async assertOwnsSlot(personId: string, slotId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    const slot = await this.meetingRepo.findSlotById(slotId);
    if (!slot || !staffId || slot.staffId !== staffId)
      throw new NotFoundException('Meeting slot not found');
    return slot;
  }

  async createSlot(personId: string, dto: CreateMeetingSlotDto) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId)
      throw new ForbiddenException('No active staff record for this account.');
    if (dto.toTime <= dto.fromTime)
      throw new BadRequestException('toTime must be after fromTime.');
    const id = await this.meetingRepo.createSlot({
      staffId,
      meetingDate: dto.meetingDate,
      fromTime: dto.fromTime,
      toTime: dto.toTime,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'MEETING_SLOT_CREATED',
      objectType: 'staff_meeting_slot',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return this.meetingRepo.findSlotById(id);
  }

  async updateSlot(personId: string, id: string, dto: UpdateMeetingSlotDto) {
    const existing = await this.assertOwnsSlot(personId, id);
    const fromTime = dto.fromTime ?? existing.fromTime;
    const toTime = dto.toTime ?? existing.toTime;
    if (toTime <= fromTime)
      throw new BadRequestException('toTime must be after fromTime.');
    await this.meetingRepo.updateSlot(id, dto);
    const updated = await this.meetingRepo.findSlotById(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'MEETING_SLOT_UPDATED',
      objectType: 'staff_meeting_slot',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async deleteSlot(personId: string, id: string) {
    const existing = await this.assertOwnsSlot(personId, id);
    await this.meetingRepo.deleteSlot(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'MEETING_SLOT_DELETED',
      objectType: 'staff_meeting_slot',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }

  async decideBooking(
    personId: string,
    bookingId: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    const booking = await this.meetingRepo.findBookingById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    await this.assertOwnsSlot(personId, booking.slotId);
    if (booking.state !== 'PENDING')
      throw new BadRequestException('This booking has already been decided.');
    await this.meetingRepo.setBookingDecision(bookingId, decision, personId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: `MEETING_BOOKING_${decision}`,
      objectType: 'staff_meeting_booking',
      objectId: bookingId,
      outcome: 'SUCCESS',
    });
    return this.meetingRepo.findBookingById(bookingId);
  }

  /** Parent's own "choose a slot" screen -- every real slot from a faculty
   * member who teaches or advises this exact child, each flagged with
   * whether it's already booked (by anyone) and, if it's this same parent's
   * own booking, its live state. */
  async listOpenSlotsForStudent(actorPersonId: string, studentId: string) {
    const isGuardian = await this.meetingRepo.isActiveGuardian(
      actorPersonId,
      studentId,
    );
    if (!isGuardian)
      throw new ForbiddenException(
        'You are not a registered guardian of this student.',
      );
    const slots = await this.meetingRepo.findOpenSlotsForStudent(studentId);
    const bookings = await this.meetingRepo.findBookingsForSlots(
      slots.map((s) => s.id),
    );
    return slots.map((slot) => ({
      ...slot,
      booking:
        bookings.find(
          (b) =>
            b.slotId === slot.id && ['PENDING', 'APPROVED'].includes(b.state),
        ) ?? null,
    }));
  }

  /** Parent-side minimal creation (see file header note). */
  async createBooking(actorPersonId: string, dto: CreateMeetingBookingDto) {
    const isGuardian = await this.meetingRepo.isActiveGuardian(
      actorPersonId,
      dto.studentId,
    );
    if (!isGuardian)
      throw new ForbiddenException(
        'You are not a registered guardian of this student.',
      );

    const slot = await this.meetingRepo.findSlotById(dto.slotId);
    if (!slot) throw new NotFoundException('Meeting slot not found');

    const { rows } = await this.postgres.query(
      `SELECT person_id FROM staff WHERE id = $1`,
      [slot.staffId],
    );
    const facultyPersonId = rows[0]?.person_id;
    if (
      !facultyPersonId ||
      !(await this.scopeRepo.teachesOrAdvisesStudent(
        facultyPersonId,
        dto.studentId,
      ))
    ) {
      throw new ForbiddenException(
        'This faculty member does not teach or advise this student.',
      );
    }

    return this.unitOfWork.run(async (client) => {
      const id = await this.meetingRepo.createBooking(
        {
          slotId: dto.slotId,
          studentId: dto.studentId,
          requestedBy: actorPersonId,
          notes: dto.notes ?? null,
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: 'PARENT',
          action: 'MEETING_BOOKING_CREATED',
          objectType: 'staff_meeting_booking',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: dto,
        },
        client,
      );
      return this.meetingRepo.findBookingById(id, client);
    });
  }

  private assertWithinJoinWindow(slot: {
    meetingDate: string;
    fromTime: string;
    toTime: string;
  }): void {
    const start = new Date(`${slot.meetingDate}T${slot.fromTime}`);
    const end = new Date(`${slot.meetingDate}T${slot.toTime}`);
    const windowOpensAt = new Date(
      start.getTime() - JOIN_WINDOW_BEFORE_MINUTES * 60_000,
    );
    const windowClosesAt = new Date(
      end.getTime() + JOIN_WINDOW_AFTER_MINUTES * 60_000,
    );
    const now = new Date();
    if (now < windowOpensAt) {
      throw new ForbiddenException(
        `This call is not open yet -- it opens ${JOIN_WINDOW_BEFORE_MINUTES} minutes before the slot's start time.`,
      );
    }
    if (now > windowClosesAt) {
      throw new ForbiddenException('This meeting slot has already ended.');
    }
  }

  /** Loads the booking and checks it's actually in a callable state+window.
   * Deliberately does NOT touch livekit_room_name -- that write only ever
   * happens after the CALLER-SPECIFIC ownership check has already passed,
   * so an unauthorized caller who merely guesses a bookingId can never
   * trigger it (see requestFacultyCallToken/requestParentCallToken, which
   * check ownership BEFORE calling ensureRoomName). */
  private async loadCallableBooking(bookingId: string) {
    const booking = await this.meetingRepo.findBookingById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.state !== 'APPROVED')
      throw new ForbiddenException('This meeting has not been approved yet.');

    const slot = await this.meetingRepo.findSlotById(booking.slotId);
    if (!slot) throw new NotFoundException('Meeting slot not found');
    this.assertWithinJoinWindow(slot);

    return booking;
  }

  private async ensureRoomName(booking: {
    id: string;
    livekitRoomName: string | null;
  }): Promise<string> {
    if (booking.livekitRoomName) return booking.livekitRoomName;
    const roomName = this.liveKit.roomNameForBooking(booking.id);
    await this.meetingRepo.setLivekitRoom(booking.id, roomName);
    return roomName;
  }

  /** FACULTY side -- caller must own the slot this booking belongs to.
   * Ownership is checked BEFORE any state is written (see loadCallableBooking's
   * own comment on why ensureRoomName only runs after this). */
  async requestFacultyCallToken(
    personId: string,
    bookingId: string,
  ): Promise<JoinCredentials> {
    const booking = await this.loadCallableBooking(bookingId);
    await this.assertOwnsSlot(personId, booking.slotId);
    const roomName = await this.ensureRoomName(booking);

    const credentials = await this.liveKit.mintJoinToken({
      roomName,
      identity: `faculty:${personId}`,
      canPublish: true,
      canSubscribe: true,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'MEETING_CALL_TOKEN_ISSUED',
      objectType: 'staff_meeting_booking',
      objectId: bookingId,
      outcome: 'SUCCESS',
    });
    return credentials;
  }

  /** PARENT side -- caller must be the guardian who actually requested this
   * exact booking (not just any guardian of the student -- this mirrors how
   * only the requester's own booking shows up as "theirs" elsewhere). Same
   * ownership-before-write ordering as the faculty side above. */
  async requestParentCallToken(
    personId: string,
    bookingId: string,
  ): Promise<JoinCredentials> {
    const booking = await this.loadCallableBooking(bookingId);
    if (booking.requestedBy !== personId)
      throw new ForbiddenException('This is not your meeting booking.');
    const roomName = await this.ensureRoomName(booking);

    const credentials = await this.liveKit.mintJoinToken({
      roomName,
      identity: `parent:${personId}`,
      canPublish: true,
      canSubscribe: true,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: 'MEETING_CALL_TOKEN_ISSUED',
      objectType: 'staff_meeting_booking',
      objectId: bookingId,
      outcome: 'SUCCESS',
    });
    return credentials;
  }

  /** Webhook-driven only (see parent-meeting-call-webhook.controller.ts) --
   * this is the AUTHORITATIVE "the call actually started" signal, unlike the
   * token-mint calls above which only mean "a screen opened". Idempotent:
   * a redelivered webhook or a second participant joining an already-started
   * call is a silent no-op (recordCallStart's own WHERE call_started_at IS
   * NULL guards the write; this early return avoids a wasted duplicate
   * notification on top of that). `joinedIdentity` is whatever this module's
   * own token minting set it to (`faculty:{personId}` / `parent:{personId}`)
   * -- self-describing so no extra lookup is needed to know who joined. */
  async handleCallStarted(
    roomName: string,
    joinedIdentity: string,
  ): Promise<void> {
    const booking = await this.meetingRepo.findBookingByRoomName(roomName);
    if (!booking || booking.callStartedAt) return;

    const slot = await this.meetingRepo.findSlotById(booking.slotId);
    if (!slot) return;
    const { rows } = await this.postgres.query(
      `SELECT person_id FROM staff WHERE id = $1`,
      [slot.staffId],
    );
    const facultyPersonId: string | undefined = rows[0]?.person_id;
    if (!facultyPersonId) return;

    const facultyJoined = joinedIdentity.startsWith('faculty:');
    const notifyPersonId = facultyJoined ? booking.requestedBy : facultyPersonId;

    await this.unitOfWork.run(async (client) => {
      await this.meetingRepo.recordCallStart(booking.id, client);
      await this.outbox.enqueue(
        {
          personId: notifyPersonId,
          aboutStudentId: booking.studentId,
          notificationType: 'MEETING_CALL_STARTED',
          title: 'Video call started',
          body: facultyJoined
            ? "Your child's teacher has started the meeting call."
            : 'The parent has joined the meeting call.',
          relatedObjectType: 'staff_meeting_booking',
          relatedObjectId: booking.id,
          deepLink: `app://meeting-call/${booking.id}`,
        },
        client,
      );
    });
  }

  /** Webhook-driven only, same reasoning as handleCallStarted above. */
  async handleCallEnded(roomName: string): Promise<void> {
    const booking = await this.meetingRepo.findBookingByRoomName(roomName);
    if (!booking) return;
    await this.meetingRepo.recordCallEnd(booking.id);
  }
}
