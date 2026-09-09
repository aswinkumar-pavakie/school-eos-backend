// Phase 7 regression tests (schedule()'s Google Calendar/Meet orchestration) plus this
// phase's three additions: reschedule -> Google sync, cancel -> Google sync, and the
// SCHEDULED -> LIVE -> COMPLETED state machine. GoogleCalendarService is mocked
// throughout — Google's real API can't be forced into FAILED/NOT_FOUND/NEEDS_REAUTH
// deterministically. The SUCCEEDED paths for all three new behaviors were additionally
// verified end-to-end against a real Google account (see the final report / README),
// which this suite doesn't repeat.

import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { AddRecordingDto } from './dto/add-recording.dto';
import { CancelOnlineClassDto } from './dto/cancel-online-class.dto';
import { RescheduleOnlineClassDto } from './dto/reschedule-online-class.dto';
import { ScheduleOnlineClassDto } from './dto/schedule-online-class.dto';
import {
  CalendarCreationOutcome,
  CalendarSyncOutcome,
} from './google/google-calendar.service';
import { OnlineClassesService } from './online-classes.service';
import { OnlineClassDetail } from './repositories/online-class.repository';

const ACTOR: AuthenticatedUser = { personId: 'person-1', roles: ['FACULTY'] };
const DTO: ScheduleOnlineClassDto = {
  subjectOfferingId: 'offering-1',
  topic: 'Introduction to Probability',
  description: 'Chapter 5',
  scheduledDate: '2026-09-20',
  startTime: '10:00',
  endTime: '11:00',
};

function makeRow(
  overrides: Partial<OnlineClassDetail> = {},
): OnlineClassDetail {
  return {
    id: 'oc-1',
    subjectOfferingId: 'offering-1',
    facultyStaffId: 'staff-1',
    subjectName: 'Mathematics',
    gradeName: 'Standard 10',
    sectionName: 'A',
    topic: 'Introduction to Probability',
    description: 'Chapter 5',
    scheduledDate: '2026-09-20',
    startTime: '10:00:00',
    endTime: '11:00:00',
    status: 'DRAFT',
    meetingProvider: 'GOOGLE_MEET',
    meetingCreationStatus: 'PENDING',
    meetingCreationError: null,
    googleCalendarEventId: null,
    googleMeetId: null,
    meetingUrl: null,
    recordingUrl: null,
    recordingAddedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

/** A SCHEDULED row with a real-looking, already-created Google Meet — the starting
 * point for every reschedule/cancel/state-transition test below. */
function makeScheduledRow(
  overrides: Partial<OnlineClassDetail> = {},
): OnlineClassDetail {
  return makeRow({
    status: 'SCHEDULED',
    meetingCreationStatus: 'SUCCEEDED',
    googleCalendarEventId: 'evt-original',
    googleMeetId: 'abc-defg-hij',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    ...overrides,
  });
}

interface BuildOptions {
  googleOutcome?: CalendarCreationOutcome;
  updateEventTimeOutcome?: CalendarSyncOutcome;
  cancelEventOutcome?: CalendarSyncOutcome;
  connection?: {
    staffId: string;
    googleAccountEmail: string;
    googleUserId: string | null;
    refreshTokenEncrypted: string;
    encryptionKeyId: string | null;
    tokenScope: string;
    status: string;
  } | null;
  claimSucceeds?: boolean;
  existingIdempotencyMatch?: string;
  /** The staff.id the authenticated actor resolves to — defaults to the row's own
   * owner. Set to something else to simulate a different faculty acting on someone
   * else's class ("wrong faculty" tests). */
  actorStaffId?: string;
}

/** In-memory fake for online_class — mutated by the same repository methods the real
 * Postgres-backed one exposes (including the WHERE-clause semantics of the atomic
 * state-transition methods), so findDetailById always reflects prior calls within a
 * test, exactly like a real UPDATE ... then SELECT would. */
function buildService(initialRow: OnlineClassDetail, opts: BuildOptions = {}) {
  let current: OnlineClassDetail = { ...initialRow };

  const onlineClassRepo = {
    findByFacultyAndIdempotencyKey: jest
      .fn()
      .mockResolvedValue(
        opts.existingIdempotencyMatch
          ? { id: opts.existingIdempotencyMatch }
          : null,
      ),
    create: jest.fn().mockResolvedValue(current.id),
    findDetailById: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...current })),
    listByFacultyAndStatuses: jest.fn(),
    hasOverlap: jest.fn().mockResolvedValue(false),
    updateSchedule: jest.fn().mockImplementation((_id: string, params: any) => {
      current = {
        ...current,
        scheduledDate: params.scheduledDate,
        startTime: `${params.startTime}:00`,
        endTime: `${params.endTime}:00`,
        version: current.version + 1,
      };
      return Promise.resolve();
    }),
    cancel: jest.fn().mockImplementation((_id: string, params: any) => {
      current = {
        ...current,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: params.reason,
        version: current.version + 1,
      };
      return Promise.resolve();
    }),
    addRecording: jest.fn().mockImplementation((_id: string, params: any) => {
      current = {
        ...current,
        recordingUrl: params.recordingUrl,
        recordingAddedAt: new Date(),
      };
      return Promise.resolve();
    }),
    claimForMeetingCreation: jest.fn().mockImplementation(() => {
      if (opts.claimSucceeds === false) return Promise.resolve(false);
      current = { ...current, meetingCreationStatus: 'CREATING' };
      return Promise.resolve(true);
    }),
    markMeetingSucceeded: jest
      .fn()
      .mockImplementation((_id: string, params: any) => {
        current = {
          ...current,
          status: 'SCHEDULED',
          meetingCreationStatus: 'SUCCEEDED',
          meetingCreationError: null,
          googleCalendarEventId: params.googleCalendarEventId,
          googleMeetId: params.googleMeetId,
          meetingUrl: params.meetingUrl,
        };
        return Promise.resolve();
      }),
    markMeetingStillPending: jest
      .fn()
      .mockImplementation((_id: string, params: any) => {
        current = {
          ...current,
          googleCalendarEventId: params.googleCalendarEventId,
        };
        return Promise.resolve();
      }),
    markMeetingFailed: jest
      .fn()
      .mockImplementation((_id: string, params: any) => {
        current = {
          ...current,
          meetingCreationStatus: 'FAILED',
          meetingCreationError: params.errorMessage,
        };
        return Promise.resolve();
      }),
    markLive: jest.fn().mockImplementation(() => {
      if (current.status !== 'SCHEDULED') return Promise.resolve(false);
      current = { ...current, status: 'LIVE', version: current.version + 1 };
      return Promise.resolve(true);
    }),
    markCompleted: jest.fn().mockImplementation(() => {
      if (current.status !== 'LIVE') return Promise.resolve(false);
      current = {
        ...current,
        status: 'COMPLETED',
        version: current.version + 1,
      };
      return Promise.resolve(true);
    }),
  } as any;

  const rescheduleRepo = {
    create: jest.fn().mockResolvedValue('history-1'),
  } as any;

  const staffRepo = {
    findByPersonId: jest.fn().mockResolvedValue({
      id: opts.actorStaffId ?? initialRow.facultyStaffId,
      personId: ACTOR.personId,
      status: 'ACTIVE',
    }),
  } as any;

  const subjectOfferingRepo = {
    findById: jest.fn().mockResolvedValue({
      id: initialRow.subjectOfferingId,
      academicYearId: 'ay-1',
      sectionId: 'section-1',
      subjectId: 'subject-1',
      teacherStaffId: initialRow.facultyStaffId,
      status: 'ACTIVE',
      subjectName: initialRow.subjectName,
      sectionName: initialRow.sectionName,
      gradeName: initialRow.gradeName,
    }),
  } as any;

  const unitOfWork = {
    run: jest.fn((work: (client: unknown) => Promise<unknown>) => work({})),
  } as any;

  const defaultConnection = {
    staffId: initialRow.facultyStaffId,
    googleAccountEmail: 'faculty@example.com',
    googleUserId: '123456',
    refreshTokenEncrypted: 'iv-base64.tag-base64.cipher-base64',
    encryptionKeyId: 'v1',
    tokenScope: 'https://www.googleapis.com/auth/calendar.events',
    status: 'ACTIVE',
  };
  const googleConnectionRepo = {
    findByStaffId: jest
      .fn()
      .mockResolvedValue(
        opts.connection === undefined ? defaultConnection : opts.connection,
      ),
    markNeedsReauth: jest.fn().mockResolvedValue(undefined),
  } as any;

  const defaultOutcome: CalendarCreationOutcome = {
    outcome: 'SUCCEEDED',
    googleCalendarEventId: 'evt-1',
    googleMeetId: 'abc-defg-hij',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
  };
  const googleCalendarService = {
    createOrCheckMeeting: jest
      .fn()
      .mockResolvedValue(opts.googleOutcome ?? defaultOutcome),
    updateEventTime: jest
      .fn()
      .mockResolvedValue(
        opts.updateEventTimeOutcome ??
          ({ outcome: 'SUCCEEDED' } as CalendarSyncOutcome),
      ),
    cancelEvent: jest
      .fn()
      .mockResolvedValue(
        opts.cancelEventOutcome ??
          ({ outcome: 'SUCCEEDED' } as CalendarSyncOutcome),
      ),
  } as any;

  const schoolRepo = {
    getTimezone: jest.fn().mockResolvedValue('Asia/Kolkata'),
  } as any;

  const service = new OnlineClassesService(
    onlineClassRepo,
    rescheduleRepo,
    staffRepo,
    subjectOfferingRepo,
    unitOfWork,
    googleConnectionRepo,
    googleCalendarService,
    schoolRepo,
  );

  return {
    service,
    onlineClassRepo,
    rescheduleRepo,
    googleConnectionRepo,
    googleCalendarService,
    staffRepo,
    getCurrent: () => current,
  };
}

const RESCHEDULE_DTO: RescheduleOnlineClassDto = {
  scheduledDate: '2026-09-25',
  startTime: '14:00',
  endTime: '15:00',
  reason: 'Clash with staff meeting',
};

describe('OnlineClassesService — Phase 7 Google Calendar/Meet creation orchestration', () => {
  it('SUCCESS: creates the event, persists event/meet ids and URL, flips to SCHEDULED', async () => {
    const row = makeRow();
    const {
      service,
      onlineClassRepo,
      googleCalendarService,
      googleConnectionRepo,
    } = buildService(row);

    const result = await service.schedule(ACTOR, DTO, 'key-success');

    expect(googleCalendarService.createOrCheckMeeting).toHaveBeenCalledTimes(1);
    expect(googleConnectionRepo.findByStaffId).toHaveBeenCalledWith(
      row.facultyStaffId,
    );
    expect(onlineClassRepo.markMeetingSucceeded).toHaveBeenCalledWith(row.id, {
      googleCalendarEventId: 'evt-1',
      googleMeetId: 'abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(result.status).toBe('SCHEDULED');
    expect(result.meetingCreationStatus).toBe('SUCCEEDED');
    expect(result.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(result.meetingCreationError).toBeNull();
  });

  it('GOOGLE FAILURE: stays DRAFT, meeting_creation_status FAILED, never marked SCHEDULED', async () => {
    const row = makeRow();
    const { service, onlineClassRepo } = buildService(row, {
      googleOutcome: {
        outcome: 'FAILED',
        message: 'Could not reach Google Calendar',
      },
    });

    const result = await service.schedule(ACTOR, DTO, 'key-failure');

    expect(onlineClassRepo.markMeetingSucceeded).not.toHaveBeenCalled();
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(row.id, {
      errorMessage: 'Could not reach Google Calendar',
    });
    expect(result.status).toBe('DRAFT');
    expect(result.meetingCreationStatus).toBe('FAILED');
    expect(result.meetingCreationError).toBe('Could not reach Google Calendar');
  });

  it('EXPIRED/REVOKED AUTHORIZATION: marks the connection NEEDS_REAUTH and the class FAILED, cleanly', async () => {
    const row = makeRow();
    const { service, onlineClassRepo, googleConnectionRepo } = buildService(
      row,
      {
        googleOutcome: { outcome: 'NEEDS_REAUTH' },
      },
    );

    const result = await service.schedule(ACTOR, DTO, 'key-reauth');

    expect(googleConnectionRepo.markNeedsReauth).toHaveBeenCalledWith(
      row.facultyStaffId,
    );
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        errorMessage: expect.stringMatching(/reconnect/i),
      }),
    );
    expect(result.status).toBe('DRAFT');
    expect(result.meetingCreationStatus).toBe('FAILED');
  });

  it('NOT CONNECTED: fails without ever calling Google at all', async () => {
    const row = makeRow();
    const { service, googleCalendarService, onlineClassRepo } = buildService(
      row,
      { connection: null },
    );

    const result = await service.schedule(ACTOR, DTO, 'key-not-connected');

    expect(googleCalendarService.createOrCheckMeeting).not.toHaveBeenCalled();
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        errorMessage: expect.stringMatching(/connect your google account/i),
      }),
    );
    expect(result.status).toBe('DRAFT');
  });

  it('PENDING (Google async conference): does not assume the Meet URL is ready — stays CREATING/DRAFT, stores the event id', async () => {
    const row = makeRow();
    const { service, onlineClassRepo } = buildService(row, {
      googleOutcome: {
        outcome: 'PENDING',
        googleCalendarEventId: 'evt-pending-1',
      },
    });

    const result = await service.schedule(ACTOR, DTO, 'key-pending');

    expect(onlineClassRepo.markMeetingStillPending).toHaveBeenCalledWith(
      row.id,
      {
        googleCalendarEventId: 'evt-pending-1',
      },
    );
    expect(onlineClassRepo.markMeetingSucceeded).not.toHaveBeenCalled();
    expect(result.status).toBe('DRAFT');
    expect(result.meetingCreationStatus).toBe('CREATING');
    expect(result.googleCalendarEventId).toBe('evt-pending-1');
    expect(result.meetingUrl).toBeNull();
  });

  it('DUPLICATE/RETRY — concurrent in-flight attempt: a row already CREATING is not re-claimed, Google is never called twice', async () => {
    const row = makeRow({ meetingCreationStatus: 'CREATING' });
    const { service, googleCalendarService, onlineClassRepo } = buildService(
      row,
      {
        claimSucceeds: false,
        existingIdempotencyMatch: row.id,
      },
    );

    const result = await service.schedule(ACTOR, DTO, 'key-duplicate');

    expect(onlineClassRepo.create).not.toHaveBeenCalled();
    expect(onlineClassRepo.claimForMeetingCreation).toHaveBeenCalledWith(
      row.id,
    );
    expect(googleCalendarService.createOrCheckMeeting).not.toHaveBeenCalled();
    expect(result.meetingCreationStatus).toBe('CREATING');
  });

  it('DUPLICATE/RETRY — already SUCCEEDED: idempotent replay never re-claims or re-calls Google', async () => {
    const row = makeRow({
      status: 'SCHEDULED',
      meetingCreationStatus: 'SUCCEEDED',
      googleCalendarEventId: 'evt-x',
      googleMeetId: 'xyz-meet',
      meetingUrl: 'https://meet.google.com/xyz-meet',
    });
    const { service, onlineClassRepo, googleCalendarService } = buildService(
      row,
      {
        existingIdempotencyMatch: row.id,
      },
    );

    const result = await service.schedule(ACTOR, DTO, 'key-already-succeeded');

    expect(onlineClassRepo.create).not.toHaveBeenCalled();
    expect(onlineClassRepo.claimForMeetingCreation).not.toHaveBeenCalled();
    expect(googleCalendarService.createOrCheckMeeting).not.toHaveBeenCalled();
    expect(result.meetingUrl).toBe('https://meet.google.com/xyz-meet');
  });

  it('PERSISTENCE — a subsequent retry of a FAILED class re-checks the existing Google event instead of creating a new one', async () => {
    const row = makeRow({
      meetingCreationStatus: 'FAILED',
      meetingCreationError: 'Could not reach Google Calendar',
      googleCalendarEventId: 'evt-from-first-attempt',
    });
    const { service, onlineClassRepo, googleCalendarService } = buildService(
      row,
      {
        existingIdempotencyMatch: row.id,
        googleOutcome: {
          outcome: 'SUCCEEDED',
          googleCalendarEventId: 'evt-from-first-attempt',
          googleMeetId: 'abc-defg-hij',
          meetingUrl: 'https://meet.google.com/abc-defg-hij',
        },
      },
    );

    const result = await service.schedule(
      ACTOR,
      DTO,
      'key-retry-after-failure',
    );

    expect(googleCalendarService.createOrCheckMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        existingEventId: 'evt-from-first-attempt',
        requestId: row.id,
      }),
    );
    expect(onlineClassRepo.markMeetingSucceeded).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        googleCalendarEventId: 'evt-from-first-attempt',
      }),
    );
    expect(result.status).toBe('SCHEDULED');
  });

  it('never trusts a client-supplied faculty/staff id — always resolves it from the authenticated person', async () => {
    const row = makeRow();
    const { service, staffRepo, googleConnectionRepo } = buildService(row);

    await service.schedule(ACTOR, DTO, 'key-authz');

    expect(staffRepo.findByPersonId).toHaveBeenCalledWith(ACTOR.personId);
    expect(googleConnectionRepo.findByStaffId).toHaveBeenCalledWith(
      row.facultyStaffId,
    );
  });
});

describe('OnlineClassesService — Google Calendar reschedule sync', () => {
  it('1-9: reschedules successfully — EOS updated, history created, version incremented, existing Google event UPDATED (not re-created), same event/meet/url preserved', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo, rescheduleRepo, googleCalendarService } =
      buildService(row);

    const result = await service.reschedule(ACTOR, row.id, RESCHEDULE_DTO);

    // 1-2: EOS date/time updated
    expect(result.startTime).toBe('14:00:00');
    expect(result.endTime).toBe('15:00:00');
    // 3: history row created with correct before/after values, before the parent update
    expect(rescheduleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        onlineClassId: row.id,
        previousStartTime: '10:00:00',
        previousEndTime: '11:00:00',
        newScheduledDate: '2026-09-25',
        newStartTime: '14:00',
        newEndTime: '15:00',
        reason: 'Clash with staff meeting',
      }),
      expect.anything(),
    );
    // 4: version incremented (once for the schedule update)
    expect(result.version).toBe(row.version + 1);
    // 5: the EXISTING event was updated, never a fresh insert. startTime/endTime must
    // be passed with seconds ("HH:mm:ss") — a real bug found during E2E testing: the
    // DTO gives "HH:mm" only, and passing that straight through produced a malformed
    // dateTime Google rejected with a 400.
    expect(googleCalendarService.updateEventTime).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-original',
        startTime: '14:00:00',
        endTime: '15:00:00',
      }),
    );
    expect(googleCalendarService.createOrCheckMeeting).not.toHaveBeenCalled();
    // 6-8: event id / meet id / url all unchanged
    expect(result.googleCalendarEventId).toBe('evt-original');
    expect(result.googleMeetId).toBe('abc-defg-hij');
    expect(result.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    // 9: no second event/meeting created — createOrCheckMeeting (the insert path) is
    // never called (asserted above); markMeetingSucceeded IS called here, but only to
    // reassert/clear meeting_creation_status/error with the *same* unchanged ids (see
    // the dedicated stale-error test below) — it never touches event/meet id or url.
    expect(onlineClassRepo.markMeetingSucceeded).toHaveBeenCalledWith(row.id, {
      googleCalendarEventId: 'evt-original',
      googleMeetId: 'abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('clears a stale meeting_creation_error from a previous failed sync once a later sync succeeds (real bug found during E2E testing)', async () => {
    // This exact scenario happened for real: an earlier reschedule attempt failed
    // (e.g. a transient Google error) and left meeting_creation_status=FAILED with an
    // error message. A later reschedule succeeds — but without this fix, the stale
    // FAILED/error from the first attempt stayed visible forever, even though Google
    // was successfully updated.
    const row = makeScheduledRow({
      meetingCreationStatus: 'FAILED',
      meetingCreationError: 'Could not reach Google Calendar',
    });
    const { service, onlineClassRepo } = buildService(row, {
      updateEventTimeOutcome: { outcome: 'SUCCEEDED' },
    });

    const result = await service.reschedule(ACTOR, row.id, RESCHEDULE_DTO);

    expect(onlineClassRepo.markMeetingSucceeded).toHaveBeenCalledWith(row.id, {
      googleCalendarEventId: 'evt-original',
      googleMeetId: 'abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(result.meetingCreationStatus).toBe('SUCCEEDED');
    expect(result.meetingCreationError).toBeNull();
  });

  it('10: conflict validation still runs — an overlapping new time is rejected before any Google call', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo, googleCalendarService } =
      buildService(row);
    onlineClassRepo.hasOverlap.mockResolvedValue(true);

    await expect(
      service.reschedule(ACTOR, row.id, RESCHEDULE_DTO),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(googleCalendarService.updateEventTime).not.toHaveBeenCalled();
  });

  it("11: wrong faculty cannot reschedule someone else's class (404, and no Google call)", async () => {
    const row = makeScheduledRow();
    const { service, googleCalendarService } = buildService(row, {
      actorStaffId: 'staff-someone-else',
    });

    await expect(
      service.reschedule(ACTOR, row.id, RESCHEDULE_DTO),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(googleCalendarService.updateEventTime).not.toHaveBeenCalled();
  });

  it('12: Google authentication failure (NEEDS_REAUTH) is handled safely — EOS reschedule still succeeds, connection flagged, error recorded, no throw', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo, googleConnectionRepo } = buildService(
      row,
      {
        updateEventTimeOutcome: { outcome: 'NEEDS_REAUTH' },
      },
    );

    const result = await service.reschedule(ACTOR, row.id, RESCHEDULE_DTO);

    expect(googleConnectionRepo.markNeedsReauth).toHaveBeenCalledWith(
      row.facultyStaffId,
    );
    expect(result.startTime).toBe('14:00:00'); // EOS side still updated
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        errorMessage: expect.stringMatching(/reconnect/i),
      }),
    );
    expect(result.meetingCreationStatus).toBe('FAILED');
    // Never falsely claims sync succeeded, but never loses the EOS-side change either.
    expect(result.status).toBe('SCHEDULED');
  });

  it('13: Google API failure is handled safely — EOS reschedule still succeeds, failure recorded, no throw', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo } = buildService(row, {
      updateEventTimeOutcome: {
        outcome: 'FAILED',
        message: 'Could not reach Google Calendar',
      },
    });

    const result = await service.reschedule(ACTOR, row.id, RESCHEDULE_DTO);

    expect(result.startTime).toBe('14:00:00');
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(row.id, {
      errorMessage: 'Could not reach Google Calendar',
    });
    expect(result.meetingCreationError).toBe('Could not reach Google Calendar');
  });

  it('Google event not found during reschedule is handled safely, not as a generic failure', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo } = buildService(row, {
      updateEventTimeOutcome: { outcome: 'NOT_FOUND' },
    });

    const result = await service.reschedule(ACTOR, row.id, RESCHEDULE_DTO);

    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        errorMessage: expect.stringMatching(/could not be found/i),
      }),
    );
    expect(result.status).toBe('SCHEDULED');
  });

  it('never calls Google at all when the class has no confirmed event yet (still DRAFT/no googleCalendarEventId)', async () => {
    const row = makeRow({
      status: 'DRAFT',
      meetingCreationStatus: 'FAILED',
      googleCalendarEventId: null,
    });
    const { service, googleCalendarService } = buildService(row);

    await service.reschedule(ACTOR, row.id, RESCHEDULE_DTO);

    expect(googleCalendarService.updateEventTime).not.toHaveBeenCalled();
    expect(googleCalendarService.createOrCheckMeeting).not.toHaveBeenCalled();
  });
});

describe('OnlineClassesService — Google Calendar cancellation sync', () => {
  const CANCEL_DTO: CancelOnlineClassDto = { reason: 'No longer needed' };

  it('1-8: cancels successfully — status CANCELLED, reason/cancelledAt/version set, Google cancellation called, record retained with event/meet ids intact for history', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo, googleCalendarService } =
      buildService(row);

    const result = await service.cancel(ACTOR, row.id, CANCEL_DTO);

    expect(result.status).toBe('CANCELLED'); // 2
    expect(result.cancellationReason).toBe('No longer needed'); // 3
    expect(result.cancelledAt).not.toBeNull(); // 4
    expect(result.version).toBe(row.version + 1); // 5
    expect(googleCalendarService.cancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-original' }),
    ); // 6
    expect(onlineClassRepo.cancel).toHaveBeenCalled(); // never a delete — record remains (7)
    expect(result.googleCalendarEventId).toBe('evt-original'); // 8
    expect(result.googleMeetId).toBe('abc-defg-hij');
    expect(result.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('9: repeated cancellation is rejected (409) before any second Google call', async () => {
    const row = makeScheduledRow();
    const { service, googleCalendarService } = buildService(row);

    await service.cancel(ACTOR, row.id, CANCEL_DTO);
    expect(googleCalendarService.cancelEvent).toHaveBeenCalledTimes(1);

    await expect(
      service.cancel(ACTOR, row.id, CANCEL_DTO),
    ).rejects.toMatchObject({ status: 409 });
    expect(googleCalendarService.cancelEvent).toHaveBeenCalledTimes(1); // still just once
  });

  it('10: a missing Google event (already deleted) is handled safely — GoogleCalendarService reports it as SUCCEEDED, cancellation completes cleanly', async () => {
    const row = makeScheduledRow();
    // GoogleCalendarService itself maps 404/410 to SUCCEEDED (see cancelEvent) — this
    // asserts the service layer handles that outcome correctly, i.e. as a success.
    const { service, onlineClassRepo } = buildService(row, {
      cancelEventOutcome: { outcome: 'SUCCEEDED' },
    });

    const result = await service.cancel(ACTOR, row.id, CANCEL_DTO);

    expect(result.status).toBe('CANCELLED');
    expect(onlineClassRepo.markMeetingFailed).not.toHaveBeenCalled();
  });

  it('11: Google authentication failure (NEEDS_REAUTH) is handled safely — cancellation still completes, connection flagged, error recorded', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo, googleConnectionRepo } = buildService(
      row,
      {
        cancelEventOutcome: { outcome: 'NEEDS_REAUTH' },
      },
    );

    const result = await service.cancel(ACTOR, row.id, CANCEL_DTO);

    expect(result.status).toBe('CANCELLED'); // EOS cancellation is never blocked by Google
    expect(googleConnectionRepo.markNeedsReauth).toHaveBeenCalledWith(
      row.facultyStaffId,
    );
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        errorMessage: expect.stringMatching(/reconnect/i),
      }),
    );
  });

  it('12: Google API failure is handled safely — cancellation still completes, failure recorded, no throw', async () => {
    const row = makeScheduledRow();
    const { service, onlineClassRepo } = buildService(row, {
      cancelEventOutcome: {
        outcome: 'FAILED',
        message: 'Could not reach Google Calendar',
      },
    });

    const result = await service.cancel(ACTOR, row.id, CANCEL_DTO);

    expect(result.status).toBe('CANCELLED');
    expect(onlineClassRepo.markMeetingFailed).toHaveBeenCalledWith(row.id, {
      errorMessage: 'Could not reach Google Calendar',
    });
  });

  it("13: wrong faculty cannot cancel someone else's class (404, and no Google call)", async () => {
    const row = makeScheduledRow();
    const { service, googleCalendarService } = buildService(row, {
      actorStaffId: 'staff-someone-else',
    });

    await expect(
      service.cancel(ACTOR, row.id, CANCEL_DTO),
    ).rejects.toMatchObject({ status: 404 });
    expect(googleCalendarService.cancelEvent).not.toHaveBeenCalled();
  });

  it('never calls Google when the class has no confirmed event yet', async () => {
    const row = makeRow({ status: 'DRAFT', googleCalendarEventId: null });
    const { service, googleCalendarService } = buildService(row);

    await service.cancel(ACTOR, row.id, CANCEL_DTO);

    expect(googleCalendarService.cancelEvent).not.toHaveBeenCalled();
  });
});

describe('OnlineClassesService — SCHEDULED -> LIVE -> COMPLETED', () => {
  it('1: SCHEDULED -> LIVE succeeds', async () => {
    const row = makeScheduledRow();
    const { service } = buildService(row);

    const result = await service.startClass(ACTOR, row.id);

    expect(result.status).toBe('LIVE');
  });

  it('2: LIVE -> COMPLETED succeeds', async () => {
    const row = makeScheduledRow({ status: 'LIVE' });
    const { service } = buildService(row);

    const result = await service.completeClass(ACTOR, row.id);

    expect(result.status).toBe('COMPLETED');
  });

  it('3: wrong faculty is rejected for both start and complete', async () => {
    const scheduled = makeScheduledRow();
    const live = makeScheduledRow({ status: 'LIVE' });

    const { service: startService } = buildService(scheduled, {
      actorStaffId: 'someone-else',
    });
    await expect(
      startService.startClass(ACTOR, scheduled.id),
    ).rejects.toMatchObject({ status: 404 });

    const { service: completeService } = buildService(live, {
      actorStaffId: 'someone-else',
    });
    await expect(
      completeService.completeClass(ACTOR, live.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('4: DRAFT cannot become LIVE', async () => {
    const row = makeRow({ status: 'DRAFT' });
    const { service } = buildService(row);
    await expect(service.startClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('5: DRAFT cannot become COMPLETED', async () => {
    const row = makeRow({ status: 'DRAFT' });
    const { service } = buildService(row);
    await expect(service.completeClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('6: SCHEDULED cannot directly become COMPLETED', async () => {
    const row = makeScheduledRow();
    const { service } = buildService(row);
    await expect(service.completeClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('7: LIVE cannot be started again', async () => {
    const row = makeScheduledRow({ status: 'LIVE' });
    const { service } = buildService(row);
    await expect(service.startClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('8: COMPLETED cannot be started again', async () => {
    const row = makeScheduledRow({ status: 'COMPLETED' });
    const { service } = buildService(row);
    await expect(service.startClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('9: COMPLETED cannot be completed again', async () => {
    const row = makeScheduledRow({ status: 'COMPLETED' });
    const { service } = buildService(row);
    await expect(service.completeClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('10: CANCELLED cannot become LIVE', async () => {
    const row = makeScheduledRow({ status: 'CANCELLED' });
    const { service } = buildService(row);
    await expect(service.startClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('11: CANCELLED cannot become COMPLETED', async () => {
    const row = makeScheduledRow({ status: 'CANCELLED' });
    const { service } = buildService(row);
    await expect(service.completeClass(ACTOR, row.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('12: version increments correctly across the full lifecycle', async () => {
    const row = makeScheduledRow(); // version 1
    const { service } = buildService(row);

    const live = await service.startClass(ACTOR, row.id);
    expect(live.version).toBe(row.version + 1);

    const completed = await service.completeClass(ACTOR, row.id);
    expect(completed.version).toBe(row.version + 2);
  });

  it('13: recording can now be added end-to-end after SCHEDULED -> LIVE -> COMPLETED, and not before', async () => {
    const row = makeScheduledRow();
    const { service } = buildService(row);
    const recordingDto: AddRecordingDto = {
      recordingUrl: 'https://example.com/recording.mp4',
    };

    // Cannot add recording while still SCHEDULED.
    await expect(
      service.addRecording(ACTOR, row.id, recordingDto),
    ).rejects.toMatchObject({ status: 409 });

    await service.startClass(ACTOR, row.id);
    // Still cannot add recording while LIVE.
    await expect(
      service.addRecording(ACTOR, row.id, recordingDto),
    ).rejects.toMatchObject({ status: 409 });

    await service.completeClass(ACTOR, row.id);
    const result = await service.addRecording(ACTOR, row.id, recordingDto);

    expect(result.status).toBe('COMPLETED');
    expect(result.recordingUrl).toBe('https://example.com/recording.mp4');
  });

  it('never trusts a client-supplied status — start/complete take no body and derive staff identity server-side', async () => {
    const row = makeScheduledRow();
    const { service, staffRepo } = buildService(row);

    await service.startClass(ACTOR, row.id);

    expect(staffRepo.findByPersonId).toHaveBeenCalledWith(ACTOR.personId);
  });
});
