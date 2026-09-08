import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ParentHostelRequestsService } from './parent-hostel-requests.service';

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
  const outingRequestRepo = {
    create: jest.fn().mockResolvedValue({ id: 'req-1' }),
    attachApprovalRequest: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({ id: 'req-1', state: 'REQUESTED' }),
    findManyForRequester: jest.fn().mockResolvedValue([]),
  } as any;
  const approvalsService = {
    createRequest: jest.fn().mockResolvedValue({ id: 'appr-1' }),
  } as any;
  const unitOfWork = {
    run: jest.fn((work: (client: unknown) => Promise<unknown>) => work({})),
  } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;

  const service = new ParentHostelRequestsService(
    guardianLinkRepo,
    studentHostelRepo,
    outingRequestRepo,
    approvalsService,
    unitOfWork,
    audit,
  );
  return {
    service,
    guardianLinkRepo,
    studentHostelRepo,
    outingRequestRepo,
    approvalsService,
    audit,
  };
}

const GATE_PASS_DTO = {
  studentId: 'student-1',
  outFrom: '2026-09-10T09:00:00Z',
  expectedReturn: '2026-09-10T18:00:00Z',
  reason: 'Family function',
};

describe('ParentHostelRequestsService', () => {
  // 22. Parent request is correctly scoped -- creates outing_request + a linked
  // approval_request in one transaction, scoped to the student's real current hostel.
  it('creates an outing_request and a linked HOSTEL_GATE_PASS_REQUEST approval_request', async () => {
    const { service, outingRequestRepo, approvalsService } = buildService();
    await service.createGatePassRequest(GATE_PASS_DTO as any, 'parent-1');

    expect(outingRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        requestedBy: 'parent-1',
      }),
      {},
    );
    expect(approvalsService.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestType: 'HOSTEL_GATE_PASS_REQUEST',
        subjectObjectType: 'outing_request',
        subjectObjectId: 'req-1',
        requestedBy: 'parent-1',
        payload: {
          approverScope: { scopeType: 'HOSTEL', scopeId: 'hostel-1' },
        },
      }),
      {},
    );
    expect(outingRequestRepo.attachApprovalRequest).toHaveBeenCalledWith(
      'req-1',
      'appr-1',
      {},
    );
  });

  // 28. Parent cannot spoof identity -- requestedBy is always the personId derived
  // from the authenticated actor argument, never anything from the DTO (the DTO has
  // no such field at all).
  it('never reads a parent/requester id from the DTO -- only from the personId argument', async () => {
    const { service, outingRequestRepo } = buildService();
    await service.createGatePassRequest(GATE_PASS_DTO as any, 'parent-1');
    const createCallArg = outingRequestRepo.create.mock.calls[0][0];
    expect(createCallArg.requestedBy).toBe('parent-1');
  });

  // 45. Unauthorized parent cannot submit for another student -- no ACTIVE guardian_link.
  it('rejects when the caller has no ACTIVE guardian_link to the named student', async () => {
    const { service, outingRequestRepo } = buildService({ link: null });
    await expect(
      service.createGatePassRequest(GATE_PASS_DTO as any, 'parent-1'),
    ).rejects.toThrow(NotFoundException);
    expect(outingRequestRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when the student has no current active hostel allocation at all', async () => {
    const { service, outingRequestRepo } = buildService({ hostelId: null });
    await expect(
      service.createGatePassRequest(GATE_PASS_DTO as any, 'parent-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(outingRequestRepo.create).not.toHaveBeenCalled();
  });

  // 44. Parent can submit an emergency request the same way.
  it('creates a HOSTEL_EMERGENCY_EXIT_REQUEST via createEmergencyExitRequest', async () => {
    const { service, approvalsService } = buildService();
    await service.createEmergencyExitRequest(
      {
        studentId: 'student-1',
        outFrom: '2026-09-10T09:00:00Z',
        expectedReturn: '2026-09-10T18:00:00Z',
        reason: 'Medical',
      } as any,
      'parent-1',
    );
    expect(approvalsService.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestType: 'HOSTEL_EMERGENCY_EXIT_REQUEST' }),
      {},
    );
  });

  // 49. Parent cannot self-approve -- structurally guaranteed: this service exposes no
  // approve/reject method at all (see hostel-warden's OutingRequestsSharedService,
  // @Roles('HOSTEL_WARDEN')-gated, for the only code path that can decide a request).
});
