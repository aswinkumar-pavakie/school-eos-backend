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
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateMeetingBookingDto } from './dto/create-meeting-booking.dto';
import { CreateMeetingSlotDto } from './dto/create-meeting-slot.dto';
import { UpdateMeetingSlotDto } from './dto/update-meeting-slot.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StaffMeetingRepository } from './repositories/staff-meeting.repository';

@Injectable()
export class FacultyParentMeetingsService {
  constructor(
    private readonly meetingRepo: StaffMeetingRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly postgres: PostgresService,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
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
}
