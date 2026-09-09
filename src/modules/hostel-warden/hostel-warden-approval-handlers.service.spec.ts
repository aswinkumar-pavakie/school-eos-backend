import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import { HostelWardenApprovalHandlers } from './hostel-warden-approval-handlers.service';
import {
  EMERGENCY_EXIT_REQUEST_TYPE,
  GATE_PASS_REQUEST_TYPE,
} from './repositories/outing-request.repository';

function buildHandlers(request: any) {
  const registry = new SubjectStateRegistry();
  const outingRequestRepo = {
    findById: jest.fn().mockResolvedValue(request),
    markState: jest.fn().mockResolvedValue(undefined),
  } as any;
  const gatePassRepo = {
    create: jest.fn().mockResolvedValue({ id: 'gp-1', passNo: 'GP-x' }),
  } as any;

  const handlers = new HostelWardenApprovalHandlers(
    registry,
    outingRequestRepo,
    gatePassRepo,
  );
  handlers.onModuleInit();
  return { registry, outingRequestRepo, gatePassRepo };
}

describe('HostelWardenApprovalHandlers (outing_request subject-state handler)', () => {
  // 29. Approved request results in a valid gate-pass state -- normal Gate Pass.
  it('onApproved issues a non-emergency gate_pass for a HOSTEL_GATE_PASS_REQUEST', async () => {
    const request = {
      id: 'req-1',
      studentId: 'student-1',
      reason: 'Family function',
      outFrom: new Date('2026-09-10T09:00:00Z'),
      expectedReturn: new Date('2026-09-10T18:00:00Z'),
      requestType: GATE_PASS_REQUEST_TYPE,
    };
    const { registry, outingRequestRepo, gatePassRepo } =
      buildHandlers(request);
    const handler = registry.get('outing_request')!;

    await handler.onApproved('req-1', {} as any, 'warden-1');

    expect(outingRequestRepo.markState).toHaveBeenCalledWith(
      'req-1',
      'APPROVED',
      {},
    );
    expect(gatePassRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        outingRequestId: 'req-1',
        studentId: 'student-1',
        isEmergency: false,
        emergencyReason: null,
        approvedBy: 'warden-1',
      }),
      {},
    );
  });

  // 6/51. Emergency Exit approval issues an is_emergency gate_pass, distinct from a
  // normal Gate Pass, carrying the emergency reason through.
  it('onApproved issues an emergency gate_pass for a HOSTEL_EMERGENCY_EXIT_REQUEST', async () => {
    const request = {
      id: 'req-2',
      studentId: 'student-2',
      reason: 'Medical emergency at home',
      outFrom: new Date('2026-09-10T09:00:00Z'),
      expectedReturn: new Date('2026-09-11T09:00:00Z'),
      requestType: EMERGENCY_EXIT_REQUEST_TYPE,
    };
    const { gatePassRepo } = buildHandlers(request);
    const registry = new SubjectStateRegistry();
    const outingRequestRepo = {
      findById: jest.fn().mockResolvedValue(request),
      markState: jest.fn().mockResolvedValue(undefined),
    } as any;
    const handlers = new HostelWardenApprovalHandlers(
      registry,
      outingRequestRepo,
      gatePassRepo,
    );
    handlers.onModuleInit();

    await registry
      .get('outing_request')!
      .onApproved('req-2', {} as any, 'warden-1');

    expect(gatePassRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isEmergency: true,
        emergencyReason: 'Medical emergency at home',
      }),
      {},
    );
  });

  it('onRejected marks the outing_request REJECTED and never issues a gate_pass', async () => {
    const request = {
      id: 'req-1',
      studentId: 'student-1',
      reason: 'x',
      outFrom: new Date(),
      expectedReturn: new Date(),
      requestType: GATE_PASS_REQUEST_TYPE,
    };
    const { registry, outingRequestRepo, gatePassRepo } =
      buildHandlers(request);
    await registry
      .get('outing_request')!
      .onRejected('req-1', {} as any, 'warden-1');
    expect(outingRequestRepo.markState).toHaveBeenCalledWith(
      'req-1',
      'REJECTED',
      {},
    );
    expect(gatePassRepo.create).not.toHaveBeenCalled();
  });

  it('onWithdrawn marks the outing_request CANCELLED', async () => {
    const request = {
      id: 'req-1',
      studentId: 'student-1',
      reason: 'x',
      outFrom: new Date(),
      expectedReturn: new Date(),
      requestType: GATE_PASS_REQUEST_TYPE,
    };
    const { registry, outingRequestRepo } = buildHandlers(request);
    await registry.get('outing_request')!.onWithdrawn!('req-1', {} as any);
    expect(outingRequestRepo.markState).toHaveBeenCalledWith(
      'req-1',
      'CANCELLED',
      {},
    );
  });
});
