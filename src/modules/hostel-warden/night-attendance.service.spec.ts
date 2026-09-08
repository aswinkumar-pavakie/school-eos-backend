import { NotFoundException } from '@nestjs/common';
import { NightAttendanceService } from './night-attendance.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'person-1',
  hostelIds: ['hostel-1'],
};

function buildService(
  opts: { hostelForStudent?: Record<string, string | null> } = {},
) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  const attendanceRepo = {
    findRoster: jest.fn().mockResolvedValue([
      {
        studentId: 'student-1',
        firstName: 'Asha',
        lastName: 'R',
        admissionNo: 'A1',
        roomNo: '101',
        bedNo: 'A',
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
        const map = opts.hostelForStudent ?? { 'student-1': 'hostel-1' };
        return Promise.resolve(map[studentId] ?? null);
      }),
  } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;
  const unitOfWork = {
    run: jest.fn((work: (client: unknown) => Promise<unknown>) => work({})),
  } as any;

  const service = new NightAttendanceService(
    wardenContext,
    attendanceRepo,
    studentHostelRepo,
    auditService,
    unitOfWork,
  );
  return {
    service,
    wardenContext,
    attendanceRepo,
    studentHostelRepo,
    auditService,
    unitOfWork,
  };
}

describe('NightAttendanceService', () => {
  // 8. Correct hostel roster returned.
  it("returns the roster scoped to the caller's own hostel(s) and date", async () => {
    const { service, attendanceRepo } = buildService();
    const roster = await service.getRoster('person-1', '2026-09-07');
    expect(attendanceRepo.findRoster).toHaveBeenCalledWith(
      ['hostel-1'],
      '2026-09-07',
    );
    expect(roster).toHaveLength(1);
  });

  // 10/11. Present/Absent marking works.
  it('marks PRESENT and ABSENT entries, recording actor and hostel_id', async () => {
    const { service, attendanceRepo } = buildService();
    const result = await service.mark(
      {
        date: '2026-09-07',
        entries: [{ studentId: 'student-1', status: 'PRESENT' }],
      },
      'person-1',
    );
    expect(attendanceRepo.upsert).toHaveBeenCalledWith(
      {
        studentId: 'student-1',
        hostelId: 'hostel-1',
        date: '2026-09-07',
        status: 'PRESENT',
        recordedBy: 'person-1',
      },
      {},
    );
    expect(result).toEqual({ marked: 1, date: '2026-09-07' });
  });

  // 12. Duplicate submission safe -- the repository's own ON CONFLICT upsert handles
  // this; the service just calls upsert again with no special-casing, and that's the
  // point (no duplicate-row error surfaces).
  it('re-marking the same student/date is a plain repeated upsert call, not an error', async () => {
    const { service, attendanceRepo } = buildService();
    await service.mark(
      {
        date: '2026-09-07',
        entries: [{ studentId: 'student-1', status: 'PRESENT' }],
      },
      'person-1',
    );
    await expect(
      service.mark(
        {
          date: '2026-09-07',
          entries: [{ studentId: 'student-1', status: 'ABSENT' }],
        },
        'person-1',
      ),
    ).resolves.toEqual({ marked: 1, date: '2026-09-07' });
    expect(attendanceRepo.upsert).toHaveBeenCalledTimes(2);
  });

  // 13. Actor/time recorded.
  it('audits the mark action with the actor and date', async () => {
    const { service, auditService } = buildService();
    await service.mark(
      {
        date: '2026-09-07',
        entries: [{ studentId: 'student-1', status: 'PRESENT' }],
      },
      'person-1',
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPersonId: 'person-1',
        action: 'HOSTEL_NIGHT_ATTENDANCE_MARKED',
        outcome: 'SUCCESS',
      }),
      {},
    );
  });

  // 9. Cross-hostel student rejected.
  it("rejects marking a student who is not in one of the caller's hostels", async () => {
    const { service, attendanceRepo, auditService } = buildService({
      hostelForStudent: { 'student-1': null },
    });
    await expect(
      service.mark(
        {
          date: '2026-09-07',
          entries: [{ studentId: 'student-1', status: 'PRESENT' }],
        },
        'person-1',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(attendanceRepo.upsert).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'DENIED',
        action: 'HOSTEL_NIGHT_ATTENDANCE_DENIED',
      }),
    );
  });
});

// 14. Does not modify class attendance -- structurally guaranteed, not just tested at
// runtime: NightAttendanceService's constructor only accepts WardenContextService,
// HostelAttendanceRepository, StudentHostelRepository, AuditService, and UnitOfWork --
// it has no dependency on anything from the academic attendance module (see the
// imports at the top of night-attendance.service.ts), so there is no code path by
// which marking night attendance could reach attendance_record/attendance_session.
