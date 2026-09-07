// Orchestration-level tests against a mocked PermissionRequestRepository -- same
// methodology as messaging.service.spec.ts and permission-activity.service.spec.ts.
// The repository's live guardian_link + student_enrolment join is what actually
// enforces "only this parent's currently-active ward" (see
// permission-request.repository.ts); here we verify the SERVICE calls it with the
// authenticated actor's own personId (never anything client-supplied) and resolves
// the resulting status/idempotency/conflict rules correctly.
//
// Numbering tracks the CONTINUE PERMISSION MODULE prompt's PARENT TESTS (26-47),
// STATUS TESTS (48-54), AUDIT TESTS (55-59) and SECURITY (60-64) lists.

import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { PermissionRequestService } from './permission-request.service';
import { PermissionRequestDetailView } from './repositories/permission-request.repository';

const PARENT_ACTOR: AuthenticatedUser = {
  personId: 'parent-1',
  roles: ['PARENT'],
};
const OTHER_PARENT_ACTOR: AuthenticatedUser = {
  personId: 'parent-2',
  roles: ['PARENT'],
};

function makeRequest(
  overrides: Partial<PermissionRequestDetailView> = {},
): PermissionRequestDetailView {
  return {
    id: 'req-1',
    activityId: 'activity-1',
    studentId: 'student-1',
    status: 'PENDING',
    respondedByPersonId: null,
    signedAt: null,
    declineReason: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    studentFirstName: 'Aarav',
    studentLastName: 'Kumar',
    activityTitle: 'Science Museum Field Trip',
    activityDescription: 'Grade 8 trip',
    permissionType: 'TRIP',
    activityDate: '2026-09-18',
    startTime: '09:00',
    endTime: '15:00',
    responseDeadline: '2099-01-01',
    activityStatus: 'ACTIVE',
    gradeName: '8',
    sectionName: 'A',
    academicYearId: 'year-1',
    sectionId: 'section-1',
    ...overrides,
  };
}

function buildService(
  opts: {
    request?: PermissionRequestDetailView | null;
    claimResult?: PermissionRequestDetailView | null;
    afterClaimRequest?: PermissionRequestDetailView | null;
  } = {},
) {
  const request = opts.request === undefined ? makeRequest() : opts.request;

  const requestRepo = {
    listForParent: jest.fn().mockResolvedValue(request ? [request] : []),
    findForParent: jest.fn().mockResolvedValue(request),
    findById: jest.fn().mockResolvedValue(request),
    claimDecision: jest.fn().mockResolvedValue(
      opts.claimResult === undefined
        ? {
            id: 'req-1',
            activityId: 'activity-1',
            studentId: 'student-1',
            status: 'CONSENTED',
            respondedByPersonId: 'parent-1',
            signedAt: new Date(),
            declineReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : opts.claimResult,
    ),
  } as any;

  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;

  const unitOfWork = {
    run: jest
      .fn()
      .mockImplementation(async (work: (client: any) => Promise<any>) =>
        work({}),
      ),
  } as any;

  const service = new PermissionRequestService(
    requestRepo,
    auditService,
    unitOfWork,
  );

  return { service, requestRepo, auditService, unitOfWork };
}

describe('PermissionRequestService — list / detail (live re-authorization only)', () => {
  it("26. list is scoped to the authenticated parent's own personId, never a client-supplied id", async () => {
    const { service, requestRepo } = buildService();
    await service.list(PARENT_ACTOR);
    expect(requestRepo.listForParent).toHaveBeenCalledWith('parent-1');
  });

  it('27. list reclassifies a PENDING request past its deadline as EXPIRED', async () => {
    const { service } = buildService({
      request: makeRequest({
        status: 'PENDING',
        responseDeadline: '2020-01-01',
      }),
    });
    const [result] = await service.list(PARENT_ACTOR);
    expect(result.status).toBe('EXPIRED');
  });

  it('28. detail 404s when the request does not exist or belongs to a ward this parent is not an active guardian of — identical message either way', async () => {
    const { service } = buildService({ request: null });
    await expect(
      service.detail(OTHER_PARENT_ACTOR, 'req-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('29. detail is authorized in the same query that fetches it — never find-then-check', async () => {
    const { service, requestRepo } = buildService();
    await service.detail(PARENT_ACTOR, 'req-1');
    expect(requestRepo.findForParent).toHaveBeenCalledWith('req-1', 'parent-1');
  });
});

describe('PermissionRequestService — consent', () => {
  it('30. consent 404s for an unauthorized/nonexistent request before touching status logic at all', async () => {
    const { service, requestRepo } = buildService({ request: null });
    await expect(
      service.consent(OTHER_PARENT_ACTOR, 'req-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(requestRepo.claimDecision).not.toHaveBeenCalled();
  });

  it('31. a PENDING, non-expired request is claimed atomically and recorded', async () => {
    const { service, requestRepo, unitOfWork } = buildService();
    requestRepo.findForParent
      .mockResolvedValueOnce(makeRequest({ status: 'PENDING' }))
      .mockResolvedValueOnce(
        makeRequest({ status: 'CONSENTED', respondedByPersonId: 'parent-1' }),
      );
    const result = await service.consent(PARENT_ACTOR, 'req-1');
    expect(requestRepo.claimDecision).toHaveBeenCalledWith(
      'req-1',
      'CONSENTED',
      'parent-1',
      null,
      expect.anything(),
    );
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('CONSENTED');
  });

  it('32. never accepts a parent/person id from the caller — only actor.personId reaches claimDecision', async () => {
    const { service, requestRepo } = buildService();
    await service.consent(PARENT_ACTOR, 'req-1');
    expect(requestRepo.claimDecision.mock.calls[0][2]).toBe('parent-1');
  });

  it('33. repeating an identical CONSENTED decision is idempotent — no second claim attempt, no error', async () => {
    const { service, requestRepo } = buildService({
      request: makeRequest({
        status: 'CONSENTED',
        respondedByPersonId: 'parent-1',
      }),
    });
    const result = await service.consent(PARENT_ACTOR, 'req-1');
    expect(result.status).toBe('CONSENTED');
    expect(requestRepo.claimDecision).not.toHaveBeenCalled();
  });

  it('34. consenting a request already DECLINED is rejected as a conflict, never silently overwritten', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'DECLINED' }),
    });
    await expect(service.consent(PARENT_ACTOR, 'req-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('35. consenting a CANCELLED request is rejected as a conflict', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'CANCELLED' }),
    });
    await expect(service.consent(PARENT_ACTOR, 'req-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('36. consenting after the deadline has passed is rejected, even though the row is still physically PENDING', async () => {
    const { service, requestRepo } = buildService({
      request: makeRequest({
        status: 'PENDING',
        responseDeadline: '2020-01-01',
      }),
    });
    await expect(service.consent(PARENT_ACTOR, 'req-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(requestRepo.claimDecision).not.toHaveBeenCalled();
  });

  it('37. a lost race (claimDecision returns null) re-fetches once and resolves via the current state rather than erroring blindly', async () => {
    const { service, requestRepo } = buildService();
    requestRepo.claimDecision.mockResolvedValueOnce(null);
    requestRepo.findForParent
      .mockResolvedValueOnce(makeRequest({ status: 'PENDING' }))
      .mockResolvedValueOnce(
        makeRequest({ status: 'CONSENTED', respondedByPersonId: 'parent-2' }),
      );
    const result = await service.consent(PARENT_ACTOR, 'req-1');
    expect(result.status).toBe('CONSENTED');
  });

  it('38. records an audit event for consent with SUCCESS outcome', async () => {
    const { service, auditService } = buildService();
    await service.consent(PARENT_ACTOR, 'req-1');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPersonId: 'parent-1',
        actorRoleCode: 'PARENT',
        action: 'PERMISSION_REQUEST_CONSENTED',
        objectType: 'permission_request',
        objectId: 'req-1',
        outcome: 'SUCCESS',
      }),
    );
  });
});

describe('PermissionRequestService — decline', () => {
  it('39. decline records the optional reason', async () => {
    const { service, requestRepo } = buildService();
    await service.decline(PARENT_ACTOR, 'req-1', {
      reason: 'Medical appointment',
    });
    expect(requestRepo.claimDecision).toHaveBeenCalledWith(
      'req-1',
      'DECLINED',
      'parent-1',
      'Medical appointment',
      expect.anything(),
    );
  });

  it('40. decline works with no reason at all', async () => {
    const { service, requestRepo } = buildService();
    await service.decline(PARENT_ACTOR, 'req-1', {});
    expect(requestRepo.claimDecision).toHaveBeenCalledWith(
      'req-1',
      'DECLINED',
      'parent-1',
      null,
      expect.anything(),
    );
  });

  it('41. repeating an identical DECLINED decision is idempotent', async () => {
    const { service, requestRepo } = buildService({
      request: makeRequest({
        status: 'DECLINED',
        declineReason: 'Already recorded',
      }),
    });
    const result = await service.decline(PARENT_ACTOR, 'req-1', {
      reason: 'A different reason this time',
    });
    expect(result.status).toBe('DECLINED');
    expect(requestRepo.claimDecision).not.toHaveBeenCalled();
  });

  it('42. declining an already-CONSENTED request is rejected as a conflict', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'CONSENTED' }),
    });
    await expect(
      service.decline(PARENT_ACTOR, 'req-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('43. declining after the deadline has passed is rejected', async () => {
    const { service } = buildService({
      request: makeRequest({
        status: 'PENDING',
        responseDeadline: '2020-01-01',
      }),
    });
    await expect(
      service.decline(PARENT_ACTOR, 'req-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('44. records an audit event for decline with SUCCESS outcome', async () => {
    const { service, auditService } = buildService();
    await service.decline(PARENT_ACTOR, 'req-1', { reason: 'Not attending' });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PERMISSION_REQUEST_DECLINED',
        outcome: 'SUCCESS',
      }),
    );
  });
});

describe('PermissionRequestService — multi-ward and multi-guardian isolation', () => {
  it('45. a parent with no live guardian_link/enrolment match for this request gets the same 404 as a nonexistent request', async () => {
    const { service } = buildService({ request: null });
    await expect(
      service.detail(OTHER_PARENT_ACTOR, 'req-999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('46. a second ACTIVE guardian sees an already-resolved decision as a no-op, never creating a conflicting second response', async () => {
    const { service, requestRepo } = buildService({
      request: makeRequest({
        status: 'CONSENTED',
        respondedByPersonId: 'parent-1',
      }),
    });
    const result = await service.consent(OTHER_PARENT_ACTOR, 'req-1');
    expect(result.status).toBe('CONSENTED');
    expect(requestRepo.claimDecision).not.toHaveBeenCalled();
  });

  it('47. a second ACTIVE guardian attempting the OPPOSITE decision is rejected as a conflict, not silently applied', async () => {
    const { service } = buildService({
      request: makeRequest({
        status: 'CONSENTED',
        respondedByPersonId: 'parent-1',
      }),
    });
    await expect(
      service.decline(OTHER_PARENT_ACTOR, 'req-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PermissionRequestService — isStudentConsented (reusable participation check)', () => {
  it('48. true only for an effectively-CONSENTED request matching the exact student', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'CONSENTED', studentId: 'student-1' }),
    });
    await expect(
      service.isStudentConsented('req-1', 'student-1'),
    ).resolves.toBe(true);
  });

  it('49. false when the request belongs to a different student than asked about', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'CONSENTED', studentId: 'student-1' }),
    });
    await expect(
      service.isStudentConsented('req-1', 'student-OTHER'),
    ).resolves.toBe(false);
  });

  it('50. false for a still-PENDING request', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'PENDING' }),
    });
    await expect(
      service.isStudentConsented('req-1', 'student-1'),
    ).resolves.toBe(false);
  });

  it('51. false for a DECLINED request', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'DECLINED' }),
    });
    await expect(
      service.isStudentConsented('req-1', 'student-1'),
    ).resolves.toBe(false);
  });

  it('52. false for a CANCELLED request (e.g. the parent activity was cancelled)', async () => {
    const { service } = buildService({
      request: makeRequest({ status: 'CANCELLED' }),
    });
    await expect(
      service.isStudentConsented('req-1', 'student-1'),
    ).resolves.toBe(false);
  });

  it('53. a CONSENTED decision stays true even after the response deadline has since passed — the decision, once made, is terminal', async () => {
    const { service } = buildService({
      request: makeRequest({
        status: 'CONSENTED',
        responseDeadline: '2020-01-01',
      }),
    });
    await expect(
      service.isStudentConsented('req-1', 'student-1'),
    ).resolves.toBe(true);
  });

  it('54. false when the request id does not exist at all', async () => {
    const { service } = buildService({ request: null });
    await expect(
      service.isStudentConsented('req-missing', 'student-1'),
    ).resolves.toBe(false);
  });
});

describe('PermissionRequestService — security / spoofing prevention', () => {
  it('60. consent never derives identity from anything but the JWT-authenticated actor', async () => {
    const { service, requestRepo } = buildService();
    await service.consent({ personId: 'parent-1', roles: ['PARENT'] }, 'req-1');
    expect(requestRepo.findForParent).toHaveBeenCalledWith('req-1', 'parent-1');
    expect(requestRepo.claimDecision.mock.calls[0][2]).toBe('parent-1');
  });

  it('61. an unauthorized parent gets 404, never a 403 that would confirm the request exists', async () => {
    const { service } = buildService({ request: null });
    await expect(
      service.consent(OTHER_PARENT_ACTOR, 'req-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('62. decline is equally re-authorized live, not just consent', async () => {
    const { service, requestRepo } = buildService({ request: null });
    await expect(
      service.decline(OTHER_PARENT_ACTOR, 'req-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(requestRepo.claimDecision).not.toHaveBeenCalled();
  });
});
