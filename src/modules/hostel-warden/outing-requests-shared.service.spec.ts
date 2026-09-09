import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { GATE_PASS_REQUEST_TYPE } from './repositories/outing-request.repository';
import { OutingRequestsSharedService } from './outing-requests-shared.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'warden-1',
  hostelIds: ['hostel-1'],
};
const ACTOR: AuthenticatedUser = {
  personId: 'warden-1',
  roles: ['HOSTEL_WARDEN'],
};

function makeRequest(overrides: any = {}) {
  return {
    id: 'req-1',
    studentId: 'student-1',
    studentFirstName: 'Asha',
    studentLastName: null,
    requestedBy: 'parent-1',
    requestedAt: new Date(),
    outFrom: new Date('2026-09-10T09:00:00Z'),
    expectedReturn: new Date('2026-09-10T18:00:00Z'),
    isOvernight: false,
    reason: 'Family function',
    destination: 'Home',
    approvalRequestId: 'appr-1',
    state: 'REQUESTED',
    requestType: GATE_PASS_REQUEST_TYPE,
    ...overrides,
  };
}

function buildService(opts: { request?: any; inScope?: boolean } = {}) {
  const request = opts.request ?? makeRequest();
  const inScope = opts.inScope ?? true;
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  const outingRequestRepo = {
    findById: jest.fn().mockResolvedValue(request),
    findManyForHostels: jest.fn().mockResolvedValue(inScope ? [request] : []),
  } as any;
  const approvalsService = {
    approve: jest.fn().mockResolvedValue(undefined),
    reject: jest.fn().mockResolvedValue(undefined),
  } as any;

  const service = new OutingRequestsSharedService(
    wardenContext,
    outingRequestRepo,
    approvalsService,
  );
  return { service, outingRequestRepo, approvalsService };
}

describe('OutingRequestsSharedService (Gate Pass / Emergency Exit)', () => {
  // 23. Warden sees requests for assigned hostel.
  it("lists requests of the given type scoped to the caller's hostels", async () => {
    const { service, outingRequestRepo } = buildService();
    const list = await service.list('warden-1', GATE_PASS_REQUEST_TYPE);
    expect(outingRequestRepo.findManyForHostels).toHaveBeenCalledWith(
      ['hostel-1'],
      GATE_PASS_REQUEST_TYPE,
    );
    expect(list).toHaveLength(1);
  });

  // 24. Warden can approve.
  it('approves a request in scope by delegating to ApprovalsService.approve with the approval_request id', async () => {
    const { service, approvalsService } = buildService();
    await service.approve('req-1', ACTOR, GATE_PASS_REQUEST_TYPE, 'Looks fine');
    expect(approvalsService.approve).toHaveBeenCalledWith(
      'appr-1',
      ACTOR,
      'Looks fine',
    );
  });

  // 25. Warden can reject.
  it('rejects a request in scope by delegating to ApprovalsService.reject', async () => {
    const { service, approvalsService } = buildService();
    await service.reject(
      'req-1',
      ACTOR,
      GATE_PASS_REQUEST_TYPE,
      'Not appropriate',
    );
    expect(approvalsService.reject).toHaveBeenCalledWith(
      'appr-1',
      ACTOR,
      'Not appropriate',
    );
  });

  // 27. Cross-hostel request rejected -- 404, not 403.
  it("a request outside the caller's hostel scope 404s on get/approve/reject", async () => {
    const { service, approvalsService } = buildService({ inScope: false });
    await expect(
      service.get('req-1', 'warden-1', GATE_PASS_REQUEST_TYPE),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.approve('req-1', ACTOR, GATE_PASS_REQUEST_TYPE, undefined),
    ).rejects.toThrow(NotFoundException);
    expect(approvalsService.approve).not.toHaveBeenCalled();
  });

  // Using the wrong endpoint's request_type (e.g. hitting gate-pass-requests/:id with
  // an id that's really an emergency exit request) also 404s -- same "wrong type looks
  // like not found" rule, keeping the two workflows genuinely separate at the API layer.
  it('a request of the wrong request_type 404s even if it exists and is in scope', async () => {
    const { service } = buildService({
      request: makeRequest({ requestType: 'HOSTEL_EMERGENCY_EXIT_REQUEST' }),
    });
    await expect(
      service.get('req-1', 'warden-1', GATE_PASS_REQUEST_TYPE),
    ).rejects.toThrow(NotFoundException);
  });

  // 30. Invalid state transition rejected -- no approval_request_id means nothing to
  // decide (shouldn't normally happen, but guarded regardless).
  it('rejects deciding a request with no linked approval_request', async () => {
    const { service } = buildService({
      request: makeRequest({ approvalRequestId: null }),
    });
    await expect(
      service.approve('req-1', ACTOR, GATE_PASS_REQUEST_TYPE, undefined),
    ).rejects.toThrow(ForbiddenException);
  });

  // 31. Repeated approval safely handled -- ApprovalsService.approve itself throws
  // ConflictException for an already-decided approval_request (see approvals module's
  // own tests/behavior); this service does not swallow or duplicate that.
  it("propagates ApprovalsService's own already-decided error rather than masking it", async () => {
    const { service, approvalsService } = buildService();
    approvalsService.approve.mockRejectedValueOnce(
      new Error('already decided'),
    );
    await expect(
      service.approve('req-1', ACTOR, GATE_PASS_REQUEST_TYPE, undefined),
    ).rejects.toThrow('already decided');
  });
});
