// Parent (guardian) read-access orchestration tests. GuardianLinkRepository and
// OnlineClassRepository are mocked here — the actual authorization semantics (REVOKED
// excluded, CLOSED/TRANSFERRED_SECTION enrolment excluded, wrong section/year excluded,
// multi-ward union, same-class-from-two-wards dedup) live entirely inside the real SQL
// JOINs in OnlineClassRepository.listForParent/findParentDetailById — those are only
// meaningfully verified against a real Postgres query (see the real E2E verification in
// the final report), not by mocking join behavior here. This suite covers the
// orchestration layer: does the service call the right repository methods, with the
// right (server-resolved) identity, and handle the no-wards/not-found cases correctly.

import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { ParentOnlineClassesService } from './parent-online-classes.service';
import { ParentOnlineClassView } from './repositories/online-class.repository';

const PARENT_ACTOR: AuthenticatedUser = {
  personId: 'parent-person-1',
  roles: ['PARENT'],
};

function makeParentView(
  overrides: Partial<ParentOnlineClassView> = {},
): ParentOnlineClassView {
  return {
    id: 'oc-1',
    subjectName: 'Mathematics',
    gradeName: 'Standard 6',
    sectionName: 'C',
    topic: 'Introduction to Probability',
    description: 'Chapter 5',
    scheduledDate: '2026-09-20',
    startTime: '10:00:00',
    endTime: '11:00:00',
    status: 'SCHEDULED',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    recordingUrl: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const DEFAULT_VIEW = makeParentView();

function buildService(
  opts: {
    wardStudentIds?: string[];
    parentDetail?: ParentOnlineClassView | null;
  } = {},
) {
  const guardianLinkRepo = {
    findActiveWardStudentIds: jest
      .fn()
      .mockResolvedValue(opts.wardStudentIds ?? ['student-1']),
  } as any;

  const onlineClassRepo = {
    listForParent: jest.fn().mockResolvedValue([DEFAULT_VIEW]),
    findParentDetailById: jest
      .fn()
      .mockResolvedValue(
        opts.parentDetail === undefined ? DEFAULT_VIEW : opts.parentDetail,
      ),
  } as any;

  const service = new ParentOnlineClassesService(
    guardianLinkRepo,
    onlineClassRepo,
  );
  return { service, guardianLinkRepo, onlineClassRepo };
}

describe('ParentOnlineClassesService — list', () => {
  it('resolves wards from the authenticated personId, never a client-supplied id, then delegates to the parent-scoped query', async () => {
    const { service, guardianLinkRepo, onlineClassRepo } = buildService();

    const result = await service.list(PARENT_ACTOR, 'upcoming');

    expect(guardianLinkRepo.findActiveWardStudentIds).toHaveBeenCalledWith(
      'parent-person-1',
    );
    expect(onlineClassRepo.listForParent).toHaveBeenCalledWith(
      'parent-person-1',
      ['DRAFT', 'SCHEDULED', 'LIVE'],
    );
    expect(result).toEqual([DEFAULT_VIEW]);
  });

  it('a parent with no active wards gets an empty list, without ever running the join query', async () => {
    const { service, onlineClassRepo } = buildService({ wardStudentIds: [] });

    const result = await service.list(PARENT_ACTOR, 'upcoming');

    expect(result).toEqual([]);
    expect(onlineClassRepo.listForParent).not.toHaveBeenCalled();
  });

  it('passes each view filter through to the same VIEW_STATUSES mapping Faculty uses', async () => {
    const { service, onlineClassRepo } = buildService();

    await service.list(PARENT_ACTOR, 'completed');
    expect(onlineClassRepo.listForParent).toHaveBeenLastCalledWith(
      'parent-person-1',
      ['COMPLETED'],
    );

    await service.list(PARENT_ACTOR, 'cancelled');
    expect(onlineClassRepo.listForParent).toHaveBeenLastCalledWith(
      'parent-person-1',
      ['CANCELLED'],
    );
  });
});

describe('ParentOnlineClassesService — detail', () => {
  it('returns the class when the parent-scoped query finds it', async () => {
    const { service } = buildService();

    const result = await service.detail(PARENT_ACTOR, 'oc-1');

    expect(result.id).toBe('oc-1');
    expect(result.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('exposes meetingUrl but never Google-internal bookkeeping fields', async () => {
    const { service } = buildService();

    const result = await service.detail(PARENT_ACTOR, 'oc-1');

    expect(result).not.toHaveProperty('googleCalendarEventId');
    expect(result).not.toHaveProperty('googleMeetId');
    expect(result).not.toHaveProperty('meetingCreationStatus');
    expect(result).not.toHaveProperty('meetingCreationError');
    expect(result).not.toHaveProperty('facultyStaffId');
  });

  it('a parent with no active wards gets 404, without ever running the join query', async () => {
    const { service, onlineClassRepo } = buildService({ wardStudentIds: [] });

    await expect(service.detail(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(onlineClassRepo.findParentDetailById).not.toHaveBeenCalled();
  });

  it("an unauthorized class id (another parent's ward, or nonexistent) is 404 — the query result is null either way", async () => {
    const { service } = buildService({ parentDetail: null });

    await expect(
      service.detail(PARENT_ACTOR, 'some-other-class-id'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('never trusts a client-supplied ward/student id — only actor.personId is ever passed to the repositories', async () => {
    const { service, guardianLinkRepo, onlineClassRepo } = buildService();

    await service.detail(PARENT_ACTOR, 'oc-1');

    expect(guardianLinkRepo.findActiveWardStudentIds).toHaveBeenCalledWith(
      PARENT_ACTOR.personId,
    );
    expect(onlineClassRepo.findParentDetailById).toHaveBeenCalledWith(
      'oc-1',
      PARENT_ACTOR.personId,
    );
  });
});

describe('ParentOnlineClassesService — join', () => {
  it('1. authorized parent + SCHEDULED + meetingUrl -> allowed, returns only {meetingUrl, status}', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({
        status: 'SCHEDULED',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    });

    const result = await service.join(PARENT_ACTOR, 'oc-1');

    expect(result).toEqual({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      status: 'SCHEDULED',
    });
  });

  it('2. authorized parent + LIVE + meetingUrl -> allowed', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({
        status: 'LIVE',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    });

    const result = await service.join(PARENT_ACTOR, 'oc-1');

    expect(result).toEqual({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      status: 'LIVE',
    });
  });

  it('3. authorized parent + DRAFT -> 409, does not reveal a meetingUrl', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({ status: 'DRAFT', meetingUrl: null }),
    });

    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toThrow(
      'Online class has not started yet',
    );
  });

  it('4. authorized parent + COMPLETED -> 409', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({
        status: 'COMPLETED',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    });

    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toThrow(
      'Online class has already ended',
    );
  });

  it('5. authorized parent + CANCELLED -> 409', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({
        status: 'CANCELLED',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    });

    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toThrow(
      'Online class was cancelled',
    );
  });

  it('6. authorized parent + SCHEDULED + meetingUrl NULL -> 409, never returns a null/missing url as success', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({ status: 'SCHEDULED', meetingUrl: null }),
    });

    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toThrow(
      'Online class meeting link is not ready',
    );
  });

  it('7. authorized parent + LIVE + meetingUrl NULL -> 409', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({ status: 'LIVE', meetingUrl: null }),
    });

    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toThrow(
      'Online class meeting link is not ready',
    );
  });

  it('8/9. unauthorized parent or nonexistent class -> 404, identical either way (never 403, never a state-specific message)', async () => {
    const { service } = buildService({ parentDetail: null });

    await expect(
      service.join(PARENT_ACTOR, 'someone-elses-class'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.join(PARENT_ACTOR, 'someone-elses-class'),
    ).rejects.toThrow('Online class not found');
  });

  it('a parent with no active wards at all gets 404 on join too, via the same detail() short-circuit', async () => {
    const { service, onlineClassRepo } = buildService({ wardStudentIds: [] });

    await expect(service.join(PARENT_ACTOR, 'oc-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(onlineClassRepo.findParentDetailById).not.toHaveBeenCalled();
  });

  it('14. success response contains ONLY meetingUrl and status — no id/subjectName/facultyStaffId/etc.', async () => {
    const { service } = buildService({
      parentDetail: makeParentView({
        status: 'LIVE',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    });

    const result = await service.join(PARENT_ACTOR, 'oc-1');

    expect(Object.keys(result).sort()).toEqual(['meetingUrl', 'status']);
  });

  it('15. join performs no write and no Google call — it only reads through the existing detail() query', async () => {
    const { service, onlineClassRepo } = buildService({
      parentDetail: makeParentView({ status: 'SCHEDULED' }),
    });

    await service.join(PARENT_ACTOR, 'oc-1');

    // The mocked OnlineClassRepository here exposes no update/create/Google methods at
    // all — if join() tried to call one, this test would throw "not a function" rather
    // than needing an explicit spy-based assertion.
    expect(onlineClassRepo.findParentDetailById).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing authorized detail() lookup — never a second, unscoped lookup by id', async () => {
    const { service, onlineClassRepo } = buildService({
      parentDetail: makeParentView({ status: 'LIVE' }),
    });
    const detailSpy = jest.spyOn(service, 'detail');

    await service.join(PARENT_ACTOR, 'oc-1');

    expect(detailSpy).toHaveBeenCalledWith(PARENT_ACTOR, 'oc-1');
    expect(onlineClassRepo.findParentDetailById).toHaveBeenCalledTimes(1);
  });
});
