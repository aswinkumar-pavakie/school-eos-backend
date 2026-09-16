import { ConflictException, NotFoundException } from '@nestjs/common';
import { CallRequestsService } from './call-requests.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'warden-1',
  hostelIds: ['hostel-1'],
};

function buildService(opts: { request?: any } = {}) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  let stored = opts.request ?? {
    id: 'call-1',
    studentId: 'student-1',
    studentFirstName: 'Asha',
    studentLastName: null,
    parentPersonId: 'parent-1',
    hostelId: 'hostel-1',
    requestedFrom: new Date('2026-09-10T18:00:00Z'),
    requestedTo: new Date('2026-09-10T18:30:00Z'),
    status: 'PENDING',
    approvedFrom: null,
    approvedTo: null,
    decidedByPersonId: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const callRequestRepo = {
    findMany: jest.fn(),
    findManyForHostels: jest.fn().mockResolvedValue([stored]),
    findById: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    findByIdForUpdate: jest
      .fn()
      .mockImplementation(() => Promise.resolve(stored)),
    decide: jest.fn().mockImplementation((_id: string, input: any) => {
      stored = {
        ...stored,
        status: input.status,
        approvedFrom: input.approvedFrom,
        approvedTo: input.approvedTo,
        decidedByPersonId: input.decidedByPersonId,
        decidedAt: new Date(),
      };
      return Promise.resolve();
    }),
  } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;
  const outbox = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  } as any;
  const unitOfWork = {
    run: jest.fn((work: (client: unknown) => Promise<unknown>) => work({})),
  } as any;

  const service = new CallRequestsService(
    wardenContext,
    callRequestRepo,
    auditService,
    outbox,
    unitOfWork,
  );
  return {
    service,
    callRequestRepo,
    auditService,
    outbox,
    getStored: () => stored,
  };
}

describe('CallRequestsService (pending feature)', () => {
  // 33. Warden sees request.
  it("lists call requests scoped to the caller's hostel(s)", async () => {
    const { service, callRequestRepo } = buildService();
    const list = await service.list('warden-1');
    expect(callRequestRepo.findManyForHostels).toHaveBeenCalledWith([
      'hostel-1',
    ]);
    expect(list).toHaveLength(1);
  });

  // 34/37. Warden approves; approved time window stored correctly.
  it('approves with the given time window', async () => {
    const { service, getStored, auditService } = buildService();
    const result = await service.approve(
      'call-1',
      {
        approvedFrom: '2026-09-10T18:00:00Z',
        approvedTo: '2026-09-10T18:15:00Z',
      } as any,
      'warden-1',
    );
    expect(result.status).toBe('APPROVED');
    expect(getStored().approvedFrom).toEqual(new Date('2026-09-10T18:00:00Z'));
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HOSTEL_CALL_REQUEST_APPROVED',
        outcome: 'SUCCESS',
      }),
      {},
    );
  });

  // 35. Warden rejects.
  it('rejects with no time window', async () => {
    const { service } = buildService();
    const result = await service.reject('call-1', 'warden-1');
    expect(result.status).toBe('REJECTED');
    expect(result.approvedFrom).toBeNull();
  });

  // 36. Cross-hostel request rejected.
  it("a call request outside the caller's hostel(s) 404s", async () => {
    const { service } = buildService({
      request: { id: 'call-1', hostelId: 'hostel-2', status: 'PENDING' },
    });
    await expect(service.get('call-1', 'warden-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  // 38. Duplicate decision safely handled.
  it('rejects deciding an already-decided call request', async () => {
    const { service } = buildService({
      request: {
        id: 'call-1',
        hostelId: 'hostel-1',
        status: 'APPROVED',
        studentId: 's',
        parentPersonId: 'p',
        requestedFrom: new Date(),
        requestedTo: new Date(),
      },
    });
    await expect(service.reject('call-1', 'warden-1')).rejects.toThrow(
      ConflictException,
    );
  });
});
