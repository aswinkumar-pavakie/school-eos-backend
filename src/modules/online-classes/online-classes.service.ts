// Faculty schedules/manages their own online classes. Phase 7 added Google Calendar +
// Meet creation immediately after a DRAFT row is created (or replayed via the same
// Idempotency-Key) — see ensureMeetingCreated(). This phase adds: reschedule/cancel
// syncing to the already-existing Google Calendar event (never creating a new one),
// and the SCHEDULED -> LIVE -> COMPLETED state transitions the recording API depends
// on. Every Google call still happens AFTER any DB transaction commits — never inside
// one — and a Google failure never blocks or misrepresents the EOS-side operation,
// which already succeeded by that point; it's recorded via
// meeting_creation_status/meeting_creation_error instead, exactly like Phase 7's
// creation flow already does.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import {
  GOOGLE_OAUTH_ERRORS,
  ONLINE_CLASS_ERRORS,
} from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { AddRecordingDto } from './dto/add-recording.dto';
import { CancelOnlineClassDto } from './dto/cancel-online-class.dto';
import { RescheduleOnlineClassDto } from './dto/reschedule-online-class.dto';
import { ScheduleOnlineClassDto } from './dto/schedule-online-class.dto';
import { GoogleCalendarService } from './google/google-calendar.service';
import { GoogleAccountConnectionRepository } from './repositories/google-account-connection.repository';
import { OnlineClassRescheduleRepository } from './repositories/online-class-reschedule.repository';
import {
  OnlineClassDetail,
  OnlineClassRepository,
  OnlineClassView,
  VIEW_STATUSES,
} from './repositories/online-class.repository';
import { SchoolRepository } from './repositories/school.repository';
import {
  StaffIdentityView,
  StaffRepository,
} from './repositories/staff.repository';
import {
  SubjectOfferingRepository,
  SubjectOfferingView,
} from './repositories/subject-offering.repository';

const IDEMPOTENCY_CONSTRAINT = 'uq_online_class_idempotency';

/** Postgres unique_violation (23505) on the given constraint — used to catch the rare
 * race where two requests with the same Idempotency-Key land concurrently and both
 * pass the pre-check before either has inserted. */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505' &&
    (err as { constraint?: string }).constraint === constraintName
  );
}

@Injectable()
export class OnlineClassesService {
  constructor(
    private readonly onlineClassRepo: OnlineClassRepository,
    private readonly rescheduleRepo: OnlineClassRescheduleRepository,
    private readonly staffRepo: StaffRepository,
    private readonly subjectOfferingRepo: SubjectOfferingRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly googleConnectionRepo: GoogleAccountConnectionRepository,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly schoolRepo: SchoolRepository,
  ) {}

  async schedule(
    actor: AuthenticatedUser,
    dto: ScheduleOnlineClassDto,
    idempotencyKey: string,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);

    // Idempotent replay: the same faculty retrying with the same key gets the original
    // record back, never a duplicate — and if Google creation failed or is still
    // pending from the first attempt, this replay is also how it gets retried.
    const existing = await this.onlineClassRepo.findByFacultyAndIdempotencyKey(
      staff.id,
      idempotencyKey,
    );
    if (existing) {
      return this.ensureMeetingCreated(existing.id, staff.id);
    }

    // Faculty authorization must use the actual staff.id resolved above — never the
    // client-supplied body — and must match subject_offering.teacher_staff_id exactly.
    // Not found and not-mine are the same 404, never revealing which.
    const offering = await this.subjectOfferingRepo.findById(
      dto.subjectOfferingId,
    );
    if (
      !offering ||
      offering.status !== 'ACTIVE' ||
      offering.teacherStaffId !== staff.id
    ) {
      throw new NotFoundException(ONLINE_CLASS_ERRORS.OFFERING_NOT_FOUND);
    }

    this.assertValidTimeRange(dto.startTime, dto.endTime);
    this.assertNotInPast(dto.scheduledDate, dto.startTime);

    const overlapping = await this.onlineClassRepo.hasOverlap(
      staff.id,
      dto.scheduledDate,
      dto.startTime,
      dto.endTime,
      null,
    );
    if (overlapping) {
      throw new ConflictException(ONLINE_CLASS_ERRORS.OVERLAPPING_SCHEDULE);
    }

    let id: string;
    try {
      // status='DRAFT' and meeting_creation_status='PENDING' are the table's own
      // defaults — no Google call happens here.
      id = await this.onlineClassRepo.create({
        subjectOfferingId: offering.id,
        facultyStaffId: staff.id,
        topic: dto.topic,
        description: dto.description ?? null,
        scheduledDate: dto.scheduledDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        idempotencyKey,
        createdBy: actor.personId,
      });
    } catch (err) {
      if (isUniqueViolation(err, IDEMPOTENCY_CONSTRAINT)) {
        const raced = await this.onlineClassRepo.findByFacultyAndIdempotencyKey(
          staff.id,
          idempotencyKey,
        );
        if (raced) {
          return this.ensureMeetingCreated(raced.id, staff.id);
        }
      }
      throw err;
    }

    return this.ensureMeetingCreated(id, staff.id);
  }

  async list(
    actor: AuthenticatedUser,
    view: OnlineClassView,
  ): Promise<OnlineClassDetail[]> {
    const staff = await this.requireActiveFaculty(actor.personId);
    return this.onlineClassRepo.listByFacultyAndStatuses(
      staff.id,
      VIEW_STATUSES[view],
    );
  }

  /** Backs the mobile Schedule form's class/section picker — see
   * SubjectOfferingRepository.findAllByTeacherStaffId. */
  async myTeachingOfferings(
    actor: AuthenticatedUser,
  ): Promise<SubjectOfferingView[]> {
    const staff = await this.requireActiveFaculty(actor.personId);
    return this.subjectOfferingRepo.findAllByTeacherStaffId(staff.id);
  }

  async detail(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);
    return this.getOwnedDetailOrThrow(id, staff.id);
  }

  async reschedule(
    actor: AuthenticatedUser,
    id: string,
    dto: RescheduleOnlineClassDto,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);
    const current = await this.getOwnedDetailOrThrow(id, staff.id);

    if (current.status !== 'DRAFT' && current.status !== 'SCHEDULED') {
      throw new ConflictException(ONLINE_CLASS_ERRORS.ALREADY_FINALIZED);
    }

    this.assertValidTimeRange(dto.startTime, dto.endTime);
    this.assertNotInPast(dto.scheduledDate, dto.startTime);

    const overlapping = await this.onlineClassRepo.hasOverlap(
      staff.id,
      dto.scheduledDate,
      dto.startTime,
      dto.endTime,
      id,
    );
    if (overlapping) {
      throw new ConflictException(ONLINE_CLASS_ERRORS.OVERLAPPING_SCHEDULE);
    }

    await this.unitOfWork.run(async (client) => {
      // History written BEFORE the parent row changes, in the same transaction —
      // never the reverse, and never partially applied.
      await this.rescheduleRepo.create(
        {
          onlineClassId: id,
          previousScheduledDate: current.scheduledDate,
          previousStartTime: current.startTime,
          previousEndTime: current.endTime,
          newScheduledDate: dto.scheduledDate,
          newStartTime: dto.startTime,
          newEndTime: dto.endTime,
          reason: dto.reason ?? null,
          rescheduledBy: actor.personId,
        },
        client,
      );

      await this.onlineClassRepo.updateSchedule(
        id,
        {
          scheduledDate: dto.scheduledDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          updatedBy: actor.personId,
        },
        client,
      );
    });

    // Google sync happens AFTER the transaction commits — never hold a DB transaction
    // open across an external API call. The EOS-side reschedule above already
    // succeeded and stays committed regardless of what happens next: a Google problem
    // is recorded via meeting_creation_status/meeting_creation_error, never rolled
    // back into and never silently presented as if it succeeded.
    if (current.googleCalendarEventId) {
      // Only ever updates the event that already exists — never events.insert here,
      // so a reschedule can never create a second Calendar event/Meet conference.
      await this.syncRescheduleToGoogle(id, staff.id, dto);
    }

    return this.getOwnedDetailOrThrow(id, staff.id);
  }

  private async syncRescheduleToGoogle(
    id: string,
    staffId: string,
    dto: RescheduleOnlineClassDto,
  ): Promise<void> {
    const current = await this.getOwnedDetailOrThrow(id, staffId);
    if (!current.googleCalendarEventId) return;

    const connection = await this.googleConnectionRepo.findByStaffId(staffId);
    if (!connection || connection.status !== 'ACTIVE') {
      const message =
        connection?.status === 'NEEDS_REAUTH'
          ? GOOGLE_OAUTH_ERRORS.NEEDS_REAUTH
          : GOOGLE_OAUTH_ERRORS.NOT_CONNECTED;
      await this.onlineClassRepo.markMeetingFailed(id, {
        errorMessage: message,
      });
      return;
    }

    const timezone = await this.schoolRepo.getTimezone();
    const outcome = await this.googleCalendarService.updateEventTime({
      refreshTokenEncrypted: connection.refreshTokenEncrypted,
      encryptionKeyId: connection.encryptionKeyId ?? 'v1',
      eventId: current.googleCalendarEventId,
      scheduledDate: dto.scheduledDate,
      // dto.startTime/endTime are validated as exactly "HH:mm" (no seconds) — but
      // toLocalDateTimeString expects "HH:mm:ss", matching what the DB round-trip
      // already gives createOrCheckMeeting. Appending ":00" here is required, not
      // cosmetic: without it Google rejected the real PATCH request with a 400
      // ("Bad Request") for a malformed dateTime — caught during real E2E testing.
      startTime: `${dto.startTime}:00`,
      endTime: `${dto.endTime}:00`,
      timezone,
    });

    switch (outcome.outcome) {
      case 'SUCCEEDED':
        // Event id/Meet id/URL are unchanged — only the time moved — but a *previous*
        // reschedule sync attempt on this same class may have left
        // meeting_creation_status/error set to FAILED. A real bug caught during E2E
        // testing: without this, a stale error from an earlier failed sync attempt
        // stayed visible forever, even after a later sync genuinely succeeded.
        // Reuses markMeetingSucceeded with the *same* ids it already has — writing
        // back unchanged values, just to also clear the stale error/status.
        await this.onlineClassRepo.markMeetingSucceeded(id, {
          googleCalendarEventId: current.googleCalendarEventId,
          googleMeetId: current.googleMeetId!,
          meetingUrl: current.meetingUrl!,
        });
        return;
      case 'NOT_FOUND':
        await this.onlineClassRepo.markMeetingFailed(id, {
          errorMessage: ONLINE_CLASS_ERRORS.GOOGLE_EVENT_NOT_FOUND,
        });
        return;
      case 'NEEDS_REAUTH':
        await this.googleConnectionRepo.markNeedsReauth(staffId);
        await this.onlineClassRepo.markMeetingFailed(id, {
          errorMessage: GOOGLE_OAUTH_ERRORS.NEEDS_REAUTH,
        });
        return;
      case 'FAILED':
        await this.onlineClassRepo.markMeetingFailed(id, {
          errorMessage: outcome.message,
        });
        return;
    }
  }

  async cancel(
    actor: AuthenticatedUser,
    id: string,
    dto: CancelOnlineClassDto,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);
    const current = await this.getOwnedDetailOrThrow(id, staff.id);

    // Also what makes repeated cancellation safe: the second call finds status
    // already CANCELLED and is rejected here, before ever reaching the Google call or
    // the DB write below — no double-sync, no double-decrement, no crash.
    if (current.status !== 'DRAFT' && current.status !== 'SCHEDULED') {
      throw new ConflictException(ONLINE_CLASS_ERRORS.ALREADY_FINALIZED);
    }

    // Google sync is attempted before the EOS write (matching the requested flow), but
    // never blocks it: cancelling in School EOS is a strong, time-sensitive faculty
    // action that must not be held hostage by a transient Google problem. A sync
    // failure is recorded via meeting_creation_status/meeting_creation_error rather
    // than silently claiming success or refusing to cancel.
    let syncErrorMessage: string | null = null;
    if (current.googleCalendarEventId) {
      const connection = await this.googleConnectionRepo.findByStaffId(
        staff.id,
      );
      if (!connection || connection.status !== 'ACTIVE') {
        syncErrorMessage =
          connection?.status === 'NEEDS_REAUTH'
            ? GOOGLE_OAUTH_ERRORS.NEEDS_REAUTH
            : GOOGLE_OAUTH_ERRORS.NOT_CONNECTED;
      } else {
        const outcome = await this.googleCalendarService.cancelEvent({
          refreshTokenEncrypted: connection.refreshTokenEncrypted,
          encryptionKeyId: connection.encryptionKeyId ?? 'v1',
          eventId: current.googleCalendarEventId,
        });
        if (outcome.outcome === 'NEEDS_REAUTH') {
          await this.googleConnectionRepo.markNeedsReauth(staff.id);
          syncErrorMessage = GOOGLE_OAUTH_ERRORS.NEEDS_REAUTH;
        } else if (outcome.outcome === 'FAILED') {
          syncErrorMessage = outcome.message;
        }
        // SUCCEEDED and NOT_FOUND (already deleted — same goal state) both mean no
        // confirmed Google event remains; neither is an error.
      }
    }

    // Updates the existing row to CANCELLED — never deletes it. googleCalendarEventId/
    // googleMeetId/meetingUrl are left exactly as they were, for historical/audit
    // reference, per the retained-for-history requirement.
    await this.onlineClassRepo.cancel(id, {
      cancelledBy: actor.personId,
      reason: dto.reason ?? null,
    });

    if (syncErrorMessage) {
      await this.onlineClassRepo.markMeetingFailed(id, {
        errorMessage: syncErrorMessage,
      });
    }

    return this.getOwnedDetailOrThrow(id, staff.id);
  }

  /** SCHEDULED -> LIVE. No request body — the backend performs the transition itself;
   * a client can never supply an arbitrary status. Enforced atomically by
   * OnlineClassRepository.markLive's WHERE clause, not by the pre-check below (which
   * exists only to give a specific, honest error message rather than a generic one on
   * the — normally rare — race where status changed between the two). */
  async startClass(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);
    await this.getOwnedDetailOrThrow(id, staff.id);

    const applied = await this.onlineClassRepo.markLive(id, {
      updatedBy: actor.personId,
    });
    if (!applied) {
      throw new ConflictException(ONLINE_CLASS_ERRORS.NOT_SCHEDULED);
    }

    return this.getOwnedDetailOrThrow(id, staff.id);
  }

  /** LIVE -> COMPLETED. Same pattern as startClass. This is what makes the recording
   * endpoint reachable — addRecording already requires status='COMPLETED'. */
  async completeClass(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);
    await this.getOwnedDetailOrThrow(id, staff.id);

    const applied = await this.onlineClassRepo.markCompleted(id, {
      updatedBy: actor.personId,
    });
    if (!applied) {
      throw new ConflictException(ONLINE_CLASS_ERRORS.NOT_LIVE);
    }

    return this.getOwnedDetailOrThrow(id, staff.id);
  }

  async addRecording(
    actor: AuthenticatedUser,
    id: string,
    dto: AddRecordingDto,
  ): Promise<OnlineClassDetail> {
    const staff = await this.requireActiveFaculty(actor.personId);
    const current = await this.getOwnedDetailOrThrow(id, staff.id);

    if (current.status !== 'COMPLETED') {
      throw new ConflictException(ONLINE_CLASS_ERRORS.NOT_COMPLETED);
    }

    await this.onlineClassRepo.addRecording(id, {
      recordingUrl: dto.recordingUrl,
      addedBy: actor.personId,
    });

    return this.getOwnedDetailOrThrow(id, staff.id);
  }

  /** Resolves the caller's actual staff.id from their authenticated person_id — never
   * trusts a client-supplied faculty/staff id anywhere in this module. */
  private async requireActiveFaculty(
    personId: string,
  ): Promise<StaffIdentityView> {
    const staff = await this.staffRepo.findByPersonId(personId);
    if (!staff || staff.status === 'EXITED') {
      throw new ForbiddenException(ONLINE_CLASS_ERRORS.NOT_FACULTY);
    }
    return staff;
  }

  /** "Doesn't exist" and "exists but isn't yours" resolve to the same 404 — an online
   * class is never revealed to a faculty member who doesn't own it. */
  private async getOwnedDetailOrThrow(
    id: string,
    staffId: string,
  ): Promise<OnlineClassDetail> {
    const detail = await this.onlineClassRepo.findDetailById(id);
    if (!detail || detail.facultyStaffId !== staffId) {
      throw new NotFoundException(ONLINE_CLASS_ERRORS.NOT_FOUND);
    }
    return detail;
  }

  /**
   * Attempts (or retries) Google Calendar + Meet creation for an already-created DRAFT
   * row, then returns the current detail either way. Never throws on a Google failure
   * — scheduling itself already succeeded (the row exists); a Google problem is
   * reported via meeting_creation_status/meeting_creation_error on the returned
   * record, not as an HTTP error, so the class stays retryable rather than the whole
   * request failing.
   *
   * Call sites: every path out of schedule() (fresh create, idempotent pre-check hit,
   * and the race-caught hit) funnels through here — so resubmitting the same
   * Idempotency-Key is exactly how a faculty retries a failed/pending Google creation,
   * with no separate "retry" endpoint needed.
   */
  private async ensureMeetingCreated(
    id: string,
    staffId: string,
  ): Promise<OnlineClassDetail> {
    const current = await this.getOwnedDetailOrThrow(id, staffId);

    if (current.meetingCreationStatus === 'SUCCEEDED') {
      // Already done — never re-hit Google on a plain replay/re-read.
      return current;
    }

    // Atomic claim: only proceeds from PENDING/FAILED. If another concurrent request
    // already claimed it (now CREATING) — or it raced to SUCCEEDED between our read
    // above and this claim — this is a no-op and we just return the current state
    // rather than calling Google a second time for the same class.
    const claimed = await this.onlineClassRepo.claimForMeetingCreation(id);
    if (!claimed) {
      return this.getOwnedDetailOrThrow(id, staffId);
    }

    const connection = await this.googleConnectionRepo.findByStaffId(staffId);
    if (!connection || connection.status !== 'ACTIVE') {
      const message =
        connection?.status === 'NEEDS_REAUTH'
          ? GOOGLE_OAUTH_ERRORS.NEEDS_REAUTH
          : GOOGLE_OAUTH_ERRORS.NOT_CONNECTED;
      await this.onlineClassRepo.markMeetingFailed(id, {
        errorMessage: message,
      });
      return this.getOwnedDetailOrThrow(id, staffId);
    }

    const timezone = await this.schoolRepo.getTimezone();
    const outcome = await this.googleCalendarService.createOrCheckMeeting({
      refreshTokenEncrypted: connection.refreshTokenEncrypted,
      encryptionKeyId: connection.encryptionKeyId ?? 'v1',
      requestId: id,
      existingEventId: current.googleCalendarEventId,
      topic: current.topic,
      description: current.description,
      scheduledDate: current.scheduledDate,
      startTime: current.startTime,
      endTime: current.endTime,
      timezone,
    });

    switch (outcome.outcome) {
      case 'SUCCEEDED':
        await this.onlineClassRepo.markMeetingSucceeded(id, {
          googleCalendarEventId: outcome.googleCalendarEventId,
          googleMeetId: outcome.googleMeetId,
          meetingUrl: outcome.meetingUrl,
        });
        break;
      case 'PENDING':
        await this.onlineClassRepo.markMeetingStillPending(id, {
          googleCalendarEventId: outcome.googleCalendarEventId,
        });
        break;
      case 'NEEDS_REAUTH':
        await this.googleConnectionRepo.markNeedsReauth(staffId);
        await this.onlineClassRepo.markMeetingFailed(id, {
          errorMessage: GOOGLE_OAUTH_ERRORS.NEEDS_REAUTH,
        });
        break;
      case 'FAILED':
        await this.onlineClassRepo.markMeetingFailed(id, {
          errorMessage: outcome.message,
        });
        break;
    }

    return this.getOwnedDetailOrThrow(id, staffId);
  }

  private assertValidTimeRange(startTime: string, endTime: string): void {
    // HH:mm, zero-padded — safe to compare lexicographically.
    if (startTime >= endTime) {
      throw new BadRequestException(ONLINE_CLASS_ERRORS.INVALID_TIME_RANGE);
    }
  }

  private assertNotInPast(scheduledDate: string, startTime: string): void {
    const scheduledAt = new Date(`${scheduledDate}T${startTime}:00`);
    if (scheduledAt.getTime() < Date.now()) {
      throw new BadRequestException(ONLINE_CLASS_ERRORS.IN_PAST);
    }
  }
}
