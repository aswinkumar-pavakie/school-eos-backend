// Health In-charge rules: transactions, guardian notices, audit, and refusals.

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HealthInchargeService } from './health-incharge.service';

const ACTOR = 'p-nurse';
const STUDENT = 'st-1';
const VISIT = 'v-1';

function build() {
  const client = { tag: 'tx' };
  const repo = {
    findActiveStudent: jest.fn().mockResolvedValue({ studentId: STUDENT, firstName: 'Asha' }),
    createVisit: jest.fn().mockResolvedValue(VISIT),
    notifyGuardians: jest.fn().mockResolvedValue(2),
    markParentNotified: jest.fn().mockResolvedValue(true),
    findVisitBasics: jest.fn().mockResolvedValue({ id: VISIT, studentId: STUDENT, action: 'REST', parentNotifiedAt: null }),
    updateVisit: jest.fn().mockResolvedValue(true),
    upsertProfile: jest.fn().mockResolvedValue(undefined),
    acknowledgeAlert: jest.fn().mockResolvedValue(true),
    alertExists: jest.fn().mockResolvedValue(true),
    lockEscalationThread: jest.fn().mockResolvedValue(undefined),
    createEscalation: jest.fn().mockResolvedValue(3),
    dashboardCounts: jest.fn().mockResolvedValue({ visitsToday: 1 }),
    searchStudents: jest.fn().mockResolvedValue([]),
  };
  const readRepo = {
    findInfirmaryVisits: jest.fn().mockResolvedValue([{ id: VISIT }]),
    findProfileByStudentId: jest.fn().mockResolvedValue(null),
    findConsentsByStudentId: jest.fn().mockResolvedValue([]),
    findEscalations: jest.fn().mockResolvedValue([]),
    findAlerts: jest.fn().mockResolvedValue([]),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const uow = { run: jest.fn(async (fn: (c: unknown) => unknown) => fn(client)) };
  const service = new HealthInchargeService(repo as never, readRepo as never, uow as never, audit as never);
  return { service, repo, readRepo, audit, uow, client };
}

const visitDto = (over: Record<string, unknown> = {}) => ({
  studentId: STUDENT,
  complaint: ' Headache ',
  action: 'REST',
  ...over,
});

describe('createVisit', () => {
  it('records the visit and its audit row in ONE transaction', async () => {
    const t = build();
    await t.service.createVisit(visitDto() as never, ACTOR);
    expect(t.uow.run).toHaveBeenCalledTimes(1);
    expect(t.repo.createVisit).toHaveBeenCalledWith(expect.objectContaining({ complaint: 'Headache', studentId: STUDENT }), ACTOR, t.client);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INFIRMARY_VISIT_RECORDED', actorRoleCode: 'HEALTH_INCHARGE' }), t.client);
  });

  it('a minor visit does NOT notify guardians by default', async () => {
    const t = build();
    const r = await t.service.createVisit(visitDto({ action: 'REST' }) as never, ACTOR);
    expect(t.repo.notifyGuardians).not.toHaveBeenCalled();
    expect(r.guardiansNotified).toBe(0);
  });

  it.each(['SENT_HOME', 'REFERRED', 'SICKBAY_ADMIT'])('a serious visit (%s) notifies guardians and marks it notified, in the same transaction', async (action) => {
    const t = build();
    const r = await t.service.createVisit(visitDto({ action }) as never, ACTOR);
    expect(t.repo.notifyGuardians).toHaveBeenCalledWith(VISIT, t.client);
    expect(t.repo.markParentNotified).toHaveBeenCalledWith(VISIT, t.client);
    expect(r.guardiansNotified).toBe(2);
    expect(r.noGuardianOnFile).toBe(false);
  });

  it('can be told not to notify even for a serious visit', async () => {
    const t = build();
    await t.service.createVisit(visitDto({ action: 'SENT_HOME', notifyParent: false }) as never, ACTOR);
    expect(t.repo.notifyGuardians).not.toHaveBeenCalled();
  });

  it('with no guardian on file: saved, NOT marked notified, and the caller is told', async () => {
    const t = build();
    t.repo.notifyGuardians.mockResolvedValue(0);
    const r = await t.service.createVisit(visitDto({ action: 'SENT_HOME' }) as never, ACTOR);
    expect(t.repo.markParentNotified).not.toHaveBeenCalled();
    expect(r.noGuardianOnFile).toBe(true);
  });

  it('refuses a student who is not active, saving nothing', async () => {
    const t = build();
    t.repo.findActiveStudent.mockResolvedValue(null);
    await expect(t.service.createVisit(visitDto() as never, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });

  it('empty vitals are stored as none, not as an empty object', async () => {
    const t = build();
    await t.service.createVisit(visitDto({ vitals: {} }) as never, ACTOR);
    expect(t.repo.createVisit).toHaveBeenCalledWith(expect.objectContaining({ vitals: null }), ACTOR, t.client);
  });
});

describe('updateVisit', () => {
  it('needs at least one field', async () => {
    const t = build();
    await expect(t.service.updateVisit(VISIT, {} as never, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('404s for an unknown visit', async () => {
    const t = build();
    t.repo.findVisitBasics.mockResolvedValue(null);
    await expect(t.service.updateVisit(VISIT, { outcome: 'ok' } as never, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('never touches the student or complaint (only observation / outcome / action)', async () => {
    const t = build();
    await t.service.updateVisit(VISIT, { observation: ' rested ', outcome: 'fine' } as never, ACTOR);
    expect(t.repo.updateVisit).toHaveBeenCalledWith(VISIT, { observation: 'rested', outcome: 'fine', action: undefined }, t.client);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INFIRMARY_VISIT_UPDATED' }), t.client);
  });
});

describe('notifyParent', () => {
  it('tells the guardians once and marks the visit', async () => {
    const t = build();
    const r = await t.service.notifyParent(VISIT, ACTOR);
    expect(r.guardiansNotified).toBe(2);
    expect(t.repo.markParentNotified).toHaveBeenCalledWith(VISIT, t.client);
  });
  it('refuses a second notice', async () => {
    const t = build();
    t.repo.findVisitBasics.mockResolvedValue({ id: VISIT, studentId: STUDENT, action: 'SENT_HOME', parentNotifiedAt: new Date() });
    await expect(t.service.notifyParent(VISIT, ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });
  it('refuses (and rolls back) when there is no guardian to tell', async () => {
    const t = build();
    t.repo.notifyGuardians.mockResolvedValue(0);
    await expect(t.service.notifyParent(VISIT, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.repo.markParentNotified).not.toHaveBeenCalled();
  });
});

describe('alerts', () => {
  it('acknowledges an open alert and audits it', async () => {
    const t = build();
    await t.service.acknowledgeAlert('12', ACTOR);
    expect(t.repo.acknowledgeAlert).toHaveBeenCalledWith('12', ACTOR);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HEALTH_ALERT_ACKNOWLEDGED' }));
  });
  it('rejects a non-numeric id before touching the database', async () => {
    const t = build();
    await expect(t.service.acknowledgeAlert('1; DROP TABLE x', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.repo.acknowledgeAlert).not.toHaveBeenCalled();
  });
  it('409 when already acknowledged, 404 when it does not exist', async () => {
    const t = build();
    t.repo.acknowledgeAlert.mockResolvedValue(false);
    await expect(t.service.acknowledgeAlert('12', ACTOR)).rejects.toBeInstanceOf(ConflictException);
    t.repo.alertExists.mockResolvedValue(false);
    await expect(t.service.acknowledgeAlert('12', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('maps the status filter (open/done/all)', async () => {
    const t = build();
    await t.service.listAlerts('open');
    await t.service.listAlerts('done');
    await t.service.listAlerts(undefined);
    expect(t.readRepo.findAlerts.mock.calls.map((c) => c[0].acknowledged)).toEqual([false, true, undefined]);
  });
});

describe('escalations', () => {
  it('logs the contact under a locked thread with the next sequence number', async () => {
    const t = build();
    const r = await t.service.createEscalation({ visitId: VISIT, contactedName: ' Mr Rao ', channel: 'PHONE' } as never, ACTOR);
    expect(t.repo.lockEscalationThread).toHaveBeenCalledWith(VISIT, t.client);
    expect(t.repo.createEscalation).toHaveBeenCalledWith(expect.objectContaining({ studentId: STUDENT, contactedName: 'Mr Rao' }), t.client);
    expect(r.sequenceNo).toBe(3);
  });
  it('404s for an unknown visit', async () => {
    const t = build();
    t.repo.findVisitBasics.mockResolvedValue(null);
    await expect(t.service.createEscalation({ visitId: VISIT, contactedName: 'x', channel: 'SMS' } as never, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('health profile', () => {
  it('blank fields are stored as NULL, and the change is audited with before/after', async () => {
    const t = build();
    await t.service.saveProfile(STUDENT, { bloodGroup: 'O+', familyDoctor: '   ', notes: ' ok ' } as never, ACTOR);
    expect(t.repo.upsertProfile).toHaveBeenCalledWith(STUDENT, expect.objectContaining({ bloodGroup: 'O+', familyDoctor: null, notes: 'ok', heightCm: null }), ACTOR, t.client);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HEALTH_PROFILE_SAVED' }), t.client);
  });
  it('refuses an inactive student', async () => {
    const t = build();
    t.repo.findActiveStudent.mockResolvedValue(null);
    await expect(t.service.saveProfile(STUDENT, {} as never, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });
});
