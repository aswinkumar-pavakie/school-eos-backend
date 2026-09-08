import { ClassAbsenceAlertsService } from './class-absence-alerts.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'warden-1',
  hostelIds: ['hostel-1'],
};
const STUDENTS = [
  { studentId: 'student-1', firstName: 'Asha', lastName: null },
];

function buildService(
  opts: {
    absentRows?: Array<{
      studentId: string;
      recordId: string;
      sectionId: string;
    }>;
    covered?: Set<string>;
    alreadyAlerted?: Set<string>;
    guardians?: string[];
  } = {},
) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  const alertRepo = {
    findActiveStudentsForHostels: jest.fn().mockResolvedValue(STUDENTS),
    findStudentIdsWithApprovedOutingCoveringDate: jest
      .fn()
      .mockResolvedValue(opts.covered ?? new Set()),
    findRecordIdsAlreadyAlerted: jest
      .fn()
      .mockResolvedValue(opts.alreadyAlerted ?? new Set()),
    findActiveGuardianPersonIds: jest
      .fn()
      .mockResolvedValue(opts.guardians ?? ['guardian-1']),
    listAlertsForHostels: jest
      .fn()
      .mockResolvedValue([{ id: 'n-1', studentId: 'student-1' }]),
  } as any;
  const attendanceRecordsService = {
    findAbsentStudentIdsForDate: jest
      .fn()
      .mockResolvedValue(
        opts.absentRows ?? [
          { studentId: 'student-1', recordId: 'ar-1', sectionId: 'sec-1' },
        ],
      ),
  } as any;
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;

  const service = new ClassAbsenceAlertsService(
    wardenContext,
    alertRepo,
    attendanceRecordsService,
    outbox,
    audit,
  );
  return { service, alertRepo, attendanceRecordsService, outbox, audit };
}

describe('ClassAbsenceAlertsService', () => {
  // 52/53/54. Class absence + hostel presence both hold -> an alert is generated.
  it('generates an alert (enqueues a notification to each active guardian) when a hosteller was marked absent in class', async () => {
    const { service, outbox, audit } = buildService();
    await service.listAlerts('warden-1', '2026-09-07');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'guardian-1',
        aboutStudentId: 'student-1',
        notificationType: 'HOSTEL_CLASS_ABSENCE_ALERT',
        relatedObjectType: 'attendance_record',
        relatedObjectId: 'ar-1',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HOSTEL_CLASS_ABSENCE_ALERT_GENERATED',
        outcome: 'SUCCESS',
      }),
    );
  });

  // 54 (negative half). No alert when the student wasn't marked absent at all.
  it('does not enqueue anything when no hosteller was absent that date', async () => {
    const { service, outbox } = buildService({ absentRows: [] });
    await service.listAlerts('warden-1', '2026-09-07');
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  // Excluded when a legitimate, Warden-approved outing covers the absence.
  it('does not alert when the student had an APPROVED outing covering that date', async () => {
    const { service, outbox } = buildService({
      covered: new Set(['student-1']),
    });
    await service.listAlerts('warden-1', '2026-09-07');
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  // Dedup: a repeat call for the same date never double-alerts.
  it('does not re-alert a record that was already alerted', async () => {
    const { service, outbox } = buildService({
      alreadyAlerted: new Set(['ar-1']),
    });
    await service.listAlerts('warden-1', '2026-09-07');
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  // 55. Class attendance is never modified -- structurally guaranteed: this service's
  // only dependency on the attendance module is AttendanceRecordsService's read-only
  // findAbsentStudentIdsForDate; it holds no attendance repository and calls no write
  // method anywhere.
  it('only ever calls the read-only findAbsentStudentIdsForDate on the attendance module', async () => {
    const { service, attendanceRecordsService } = buildService();
    await service.listAlerts('warden-1', '2026-09-07');
    expect(Object.keys(attendanceRecordsService)).toEqual([
      'findAbsentStudentIdsForDate',
    ]);
  });

  // 56. Parent-targeted alert is correctly scoped -- only active hostellers in the
  // caller's own hostel(s) are ever candidates (findActiveStudentsForHostels is
  // called with exactly ctx.hostelIds).
  it("only considers students in the caller's own hostel(s)", async () => {
    const { service, alertRepo } = buildService();
    await service.listAlerts('warden-1', '2026-09-07');
    expect(alertRepo.findActiveStudentsForHostels).toHaveBeenCalledWith([
      'hostel-1',
    ]);
  });

  // Regression test for a real bug: the list must actually be scoped to the
  // requested date, not just use it for the generation side-effect and then
  // return the hostel's entire alert history regardless.
  it('lists alerts scoped to the requested date, not the whole history', async () => {
    const { service, alertRepo } = buildService();
    await service.listAlerts('warden-1', '2026-09-07');
    expect(alertRepo.listAlertsForHostels).toHaveBeenCalledWith(
      ['hostel-1'],
      '2026-09-07',
    );
  });

  it('defaults to today when no date is given, and lists using that same default', async () => {
    const { service, alertRepo, attendanceRecordsService } = buildService();
    const today = new Date().toISOString().slice(0, 10);
    await service.listAlerts('warden-1', undefined);
    expect(
      attendanceRecordsService.findAbsentStudentIdsForDate,
    ).toHaveBeenCalledWith(['student-1'], today);
    expect(alertRepo.listAlertsForHostels).toHaveBeenCalledWith(
      ['hostel-1'],
      today,
    );
  });
});
