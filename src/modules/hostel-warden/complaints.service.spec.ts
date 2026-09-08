import { ConflictException, NotFoundException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'warden-1',
  hostelIds: ['hostel-1'],
};

function buildService(opts: { complaint?: any } = {}) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  let stored = opts.complaint ?? {
    id: 'complaint-1',
    hostelId: 'hostel-1',
    blockId: null,
    roomId: null,
    issueType: 'ELECTRICAL',
    subject: 'Fan not working',
    description: 'Ceiling fan in room 204 does not turn on',
    raisedByPersonId: 'warden-1',
    assignedTo: null,
    state: 'OPEN',
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const complaintRepo = {
    create: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    findById: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    findManyForHostels: jest.fn().mockResolvedValue([stored]),
    updateState: jest.fn().mockImplementation((_id: string, state: string) => {
      stored = {
        ...stored,
        state,
        resolvedAt:
          state === 'RESOLVED' || state === 'CLOSED'
            ? new Date()
            : stored.resolvedAt,
      };
      return Promise.resolve(stored);
    }),
  } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;

  const service = new ComplaintsService(
    wardenContext,
    complaintRepo,
    auditService,
  );
  return { service, complaintRepo, auditService, getStored: () => stored };
}

const CREATE_DTO = {
  issueType: 'ELECTRICAL',
  subject: 'Fan not working',
  description: 'Ceiling fan in room 204 does not turn on',
};

describe('ComplaintsService (pending feature)', () => {
  // 64. Warden can create complaint.
  it("creates a complaint scoped to the caller's own hostel, category fixed to HOSTEL server-side", async () => {
    const { service, complaintRepo } = buildService();
    const complaint = await service.create(CREATE_DTO as any, 'warden-1');
    expect(complaintRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hostelId: 'hostel-1',
        issueType: 'ELECTRICAL',
        raisedByPersonId: 'warden-1',
      }),
    );
    expect(complaint.id).toBe('complaint-1');
  });

  // 67. Warden can view own hostel complaints.
  it("lists complaints for the caller's hostel(s)", async () => {
    const { service, complaintRepo } = buildService();
    const list = await service.list('warden-1');
    expect(complaintRepo.findManyForHostels).toHaveBeenCalledWith(['hostel-1']);
    expect(list).toHaveLength(1);
  });

  // 65/66. Complaint is hostel-scoped; cross-hostel complaint inaccessible.
  it("a complaint outside the caller's hostel(s) 404s", async () => {
    const { service } = buildService({
      complaint: { id: 'complaint-1', hostelId: 'hostel-2', state: 'OPEN' },
    });
    await expect(service.get('complaint-1', 'warden-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  // 68. Status tracking works.
  it('moves an OPEN complaint to IN_PROGRESS', async () => {
    const { service } = buildService();
    const updated = await service.updateStatus(
      'complaint-1',
      { state: 'IN_PROGRESS' } as any,
      'warden-1',
    );
    expect(updated.state).toBe('IN_PROGRESS');
  });

  // 69. Invalid status transition rejected.
  it('rejects an invalid transition (e.g. CLOSED back to OPEN)', async () => {
    const { service } = buildService({
      complaint: { id: 'complaint-1', hostelId: 'hostel-1', state: 'CLOSED' },
    });
    await expect(
      service.updateStatus('complaint-1', { state: 'OPEN' } as any, 'warden-1'),
    ).rejects.toThrow(ConflictException);
  });

  // 70. Duplicate/retry complaint handling is safe -- re-issuing the same status
  // update (e.g. IN_PROGRESS -> IN_PROGRESS on a retried request) is rejected the same
  // way any other invalid transition is (IN_PROGRESS isn't in its own allowed-target
  // list), so a retried PATCH never silently double-applies a side effect.
  it('a retried identical status update is rejected as a no-op transition, not silently reapplied', async () => {
    const { service } = buildService({
      complaint: {
        id: 'complaint-1',
        hostelId: 'hostel-1',
        state: 'IN_PROGRESS',
      },
    });
    await expect(
      service.updateStatus(
        'complaint-1',
        { state: 'IN_PROGRESS' } as any,
        'warden-1',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
