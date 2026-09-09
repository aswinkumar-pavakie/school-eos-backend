import { NotFoundException } from '@nestjs/common';
import { VisitorLogService } from './visitor-log.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'person-1',
  hostelIds: ['hostel-1'],
};

function buildService(
  opts: { hostelForStudent?: string | null; visitor?: any } = {},
) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  let stored = opts.visitor ?? {
    id: 'visitor-1',
    studentId: 'student-1',
    studentFirstName: 'Asha',
    studentLastName: null,
    visitorName: 'Mrs. R',
    relationship: 'Mother',
    idProofRef: null,
    phone: null,
    enteredAt: new Date('2026-09-07T10:00:00Z'),
    exitedAt: null,
    recordedBy: 'person-1',
  };
  const visitorRepo = {
    findMany: jest.fn().mockResolvedValue([stored]),
    findById: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    create: jest.fn().mockImplementation(() => {
      stored = { ...stored };
      return Promise.resolve(stored);
    }),
    markExited: jest.fn().mockImplementation(() => {
      if (stored.exitedAt) return Promise.resolve(false);
      stored = { ...stored, exitedAt: new Date('2026-09-07T12:00:00Z') };
      return Promise.resolve(true);
    }),
  } as any;
  const studentHostelRepo = {
    findActiveHostelIdForStudent: jest
      .fn()
      .mockResolvedValue(
        opts.hostelForStudent === undefined
          ? 'hostel-1'
          : opts.hostelForStudent,
      ),
  } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;

  const service = new VisitorLogService(
    wardenContext,
    visitorRepo,
    studentHostelRepo,
    auditService,
  );
  return {
    service,
    visitorRepo,
    studentHostelRepo,
    auditService,
    getStored: () => stored,
  };
}

describe('VisitorLogService', () => {
  // 39/40. Visitor entry works, entry timestamp recorded.
  it("records visitor entry for a student in the caller's hostel", async () => {
    const { service, visitorRepo, auditService } = buildService();
    const dto = {
      studentId: 'student-1',
      visitorName: 'Mrs. R',
      relationship: 'Mother',
    };
    const result = await service.recordEntry(dto as any, 'person-1');
    expect(visitorRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        visitorName: 'Mrs. R',
        recordedBy: 'person-1',
      }),
    );
    expect(result.id).toBe('visitor-1');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HOSTEL_VISITOR_ENTRY_RECORDED',
        outcome: 'SUCCESS',
      }),
    );
  });

  // 43. Cross-hostel access rejected.
  it("rejects recording a visitor for a student outside the caller's hostel", async () => {
    const { service, visitorRepo } = buildService({ hostelForStudent: null });
    const dto = { studentId: 'student-1', visitorName: 'Mrs. R' };
    await expect(service.recordEntry(dto as any, 'person-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(visitorRepo.create).not.toHaveBeenCalled();
  });

  // 41. Visitor exit works.
  it('marks a visitor exited', async () => {
    const { service, getStored } = buildService();
    const result = await service.recordExit('visitor-1', 'person-1');
    expect(result.exitedAt).not.toBeNull();
    expect(getStored().exitedAt).not.toBeNull();
  });

  // 42. Duplicate exit safe.
  it('a second exit call on an already-exited visitor is a safe no-op, not an error', async () => {
    const alreadyExited = {
      id: 'visitor-1',
      studentId: 'student-1',
      studentFirstName: 'Asha',
      studentLastName: null,
      visitorName: 'Mrs. R',
      relationship: 'Mother',
      idProofRef: null,
      phone: null,
      enteredAt: new Date('2026-09-07T10:00:00Z'),
      exitedAt: new Date('2026-09-07T11:00:00Z'),
      recordedBy: 'person-1',
    };
    const { service, visitorRepo } = buildService({ visitor: alreadyExited });
    const result = await service.recordExit('visitor-1', 'person-1');
    expect(result.exitedAt).toEqual(alreadyExited.exitedAt);
    expect(visitorRepo.markExited).toHaveBeenCalledTimes(1);
  });

  it("viewing a visitor outside the caller's hostel 404s, not 403", async () => {
    const { service } = buildService({ hostelForStudent: null });
    await expect(service.get('visitor-1', 'person-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
