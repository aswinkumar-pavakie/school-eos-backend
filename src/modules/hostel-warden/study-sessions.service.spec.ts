import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudySessionsService } from './study-sessions.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'warden-1',
  hostelIds: ['hostel-1'],
};

function buildService(
  opts: {
    session?: any;
    hostelForStudent?: Record<string, string | null>;
  } = {},
) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  const session = opts.session ?? {
    id: 'session-1',
    hostelId: 'hostel-1',
    sessionDate: '2026-09-07',
    startTime: '19:00',
    endTime: '21:00',
    createdByStaffId: 'staff-1',
    isLocked: false,
    createdAt: new Date(),
  };
  const sessionRepo = {
    create: jest.fn().mockResolvedValue(session),
    findById: jest.fn().mockResolvedValue(session),
    findMany: jest.fn().mockResolvedValue([session]),
  } as any;
  const attendanceRepo = {
    findRoster: jest.fn().mockResolvedValue([
      {
        studentId: 'student-1',
        firstName: 'Asha',
        lastName: null,
        admissionNo: 'A1',
        attendanceId: null,
        status: null,
        recordedAt: null,
      },
    ]),
    upsert: jest.fn().mockResolvedValue(undefined),
  } as any;
  const studentHostelRepo = {
    findActiveHostelIdForStudent: jest
      .fn()
      .mockImplementation((studentId: string) => {
        const map: Record<string, string | null> = opts.hostelForStudent ?? {
          'student-1': session.hostelId,
        };
        return Promise.resolve(map[studentId] ?? null);
      }),
  } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;
  const unitOfWork = {
    run: jest.fn((work: (client: unknown) => Promise<unknown>) => work({})),
  } as any;

  const service = new StudySessionsService(
    wardenContext,
    sessionRepo,
    attendanceRepo,
    studentHostelRepo,
    auditService,
    unitOfWork,
  );
  return {
    service,
    sessionRepo,
    attendanceRepo,
    studentHostelRepo,
    auditService,
  };
}

const CREATE_DTO = {
  sessionDate: '2026-09-07',
  startTime: '19:00',
  endTime: '21:00',
};

describe('StudySessionsService (pending feature)', () => {
  // 15. Study session creation works.
  it("creates a session for the caller's own hostel", async () => {
    const { service, sessionRepo } = buildService();
    const session = await service.create(CREATE_DTO as any, 'warden-1');
    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hostelId: 'hostel-1',
        sessionDate: '2026-09-07',
        createdByStaffId: 'staff-1',
      }),
    );
    expect(session.id).toBe('session-1');
  });

  // Found via live E2E testing: an end time before the start time reached the DB's
  // own CHECK constraint as a raw, unhandled 500 instead of a clean 400.
  it('rejects an end time that is not after the start time', async () => {
    const { service, sessionRepo } = buildService();
    await expect(
      service.create(
        { ...CREATE_DTO, startTime: '21:00', endTime: '19:00' } as any,
        'warden-1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });

  // 16. Correct hostel students returned.
  it("returns the roster for a session in the caller's hostel", async () => {
    const { service, attendanceRepo } = buildService();
    const { roster } = await service.getRoster('session-1', 'warden-1');
    expect(attendanceRepo.findRoster).toHaveBeenCalledWith(
      'session-1',
      'hostel-1',
    );
    expect(roster).toHaveLength(1);
  });

  it("a session outside the caller's hostel(s) 404s", async () => {
    const { service } = buildService({
      session: { id: 'session-1', hostelId: 'hostel-2', isLocked: false },
    });
    await expect(service.getRoster('session-1', 'warden-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  // 17/18. Present/absent marking works.
  it('marks study attendance entries', async () => {
    const { service, attendanceRepo, auditService } = buildService();
    const result = await service.mark(
      'session-1',
      { entries: [{ studentId: 'student-1', status: 'PRESENT' }] } as any,
      'warden-1',
    );
    expect(attendanceRepo.upsert).toHaveBeenCalledWith(
      {
        sessionId: 'session-1',
        studentId: 'student-1',
        status: 'PRESENT',
        recordedBy: 'warden-1',
      },
      {},
    );
    expect(result).toEqual({ marked: 1 });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'HOSTEL_STUDY_ATTENDANCE_MARKED' }),
      {},
    );
  });

  // 19. Duplicate submission safe -- the repository's own ON CONFLICT upsert handles
  // this the same way Night Attendance does.
  it('re-marking the same student in a session is a plain repeated upsert, not an error', async () => {
    const { service, attendanceRepo } = buildService();
    await service.mark(
      'session-1',
      { entries: [{ studentId: 'student-1', status: 'PRESENT' }] } as any,
      'warden-1',
    );
    await expect(
      service.mark(
        'session-1',
        { entries: [{ studentId: 'student-1', status: 'ABSENT' }] } as any,
        'warden-1',
      ),
    ).resolves.toEqual({ marked: 1 });
    expect(attendanceRepo.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects marking a locked session', async () => {
    const { service } = buildService({
      session: { id: 'session-1', hostelId: 'hostel-1', isLocked: true },
    });
    await expect(
      service.mark(
        'session-1',
        { entries: [{ studentId: 'student-1', status: 'PRESENT' }] } as any,
        'warden-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects creating a session for a hostel the caller doesn't warden", async () => {
    const { service } = buildService();
    await expect(
      service.create(
        { ...CREATE_DTO, hostelId: 'some-other-hostel' } as any,
        'warden-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // Found via live E2E testing: an entry naming a student outside the session's own
  // hostel must be rejected too -- the roster itself is correctly scoped, but a
  // hand-crafted mark body naming an arbitrary studentId wasn't being checked before
  // this fix.
  it("rejects marking an entry for a student outside the session's hostel", async () => {
    const { service, attendanceRepo } = buildService({
      hostelForStudent: { 'student-1': null },
    });
    await expect(
      service.mark(
        'session-1',
        { entries: [{ studentId: 'student-1', status: 'PRESENT' }] } as any,
        'warden-1',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(attendanceRepo.upsert).not.toHaveBeenCalled();
  });

  // 20. Study attendance remains separate from class attendance / night attendance --
  // structurally guaranteed: StudySessionsService's constructor only depends on
  // WardenContextService, HostelStudySessionRepository, HostelStudyAttendanceRepository,
  // StudentHostelRepository, AuditService, and UnitOfWork -- no dependency on the
  // attendance module or HostelAttendanceRepository (Night Attendance's own
  // repository) at all.

  // 21. Optional image/reference handling follows existing media architecture -- not
  // built in this phase (see the module plan): no image field exists on
  // hostel_study_attendance or in MarkStudyAttendanceDto; a future capture flow would
  // attach a photo via the existing generic `document` table instead of a new column.
});
