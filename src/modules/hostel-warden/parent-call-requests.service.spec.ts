import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ParentCallRequestsService } from './parent-call-requests.service';

function buildService(opts: { link?: any; hostelId?: string | null } = {}) {
  const guardianLinkRepo = {
    findActiveLink: jest
      .fn()
      .mockResolvedValue(
        opts.link === undefined ? { accessLevel: 'FULL' } : opts.link,
      ),
  } as any;
  const studentHostelRepo = {
    findCurrentHostelIdForStudent: jest
      .fn()
      .mockResolvedValue(
        opts.hostelId === undefined ? 'hostel-1' : opts.hostelId,
      ),
  } as any;
  const callRequestRepo = {
    create: jest.fn().mockResolvedValue({ id: 'call-1', status: 'PENDING' }),
    findManyForParent: jest.fn().mockResolvedValue([]),
  } as any;
  const wardenAssignmentRepo = {
    findPersonIdsForHostel: jest.fn().mockResolvedValue(['warden-1']),
  } as any;
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;

  const service = new ParentCallRequestsService(
    guardianLinkRepo,
    studentHostelRepo,
    callRequestRepo,
    wardenAssignmentRepo,
    outbox,
    audit,
  );
  return {
    service,
    guardianLinkRepo,
    studentHostelRepo,
    callRequestRepo,
    wardenAssignmentRepo,
    outbox,
    audit,
  };
}

const DTO = {
  studentId: 'student-1',
  requestedFrom: '2026-09-10T18:00:00Z',
  requestedTo: '2026-09-10T18:30:00Z',
};

describe('ParentCallRequestsService (pending feature)', () => {
  // 32. Parent request is correctly scoped.
  it("creates a call request with the student's current hostel and the parent as requester", async () => {
    const { service, callRequestRepo } = buildService();
    await service.create(DTO as any, 'parent-1');
    expect(callRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        parentPersonId: 'parent-1',
        hostelId: 'hostel-1',
      }),
    );
  });

  it('rejects when the caller has no ACTIVE guardian_link to the student', async () => {
    const { service, callRequestRepo } = buildService({ link: null });
    await expect(service.create(DTO as any, 'parent-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(callRequestRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when the student has no current hostel allocation', async () => {
    const { service } = buildService({ hostelId: null });
    await expect(service.create(DTO as any, 'parent-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
