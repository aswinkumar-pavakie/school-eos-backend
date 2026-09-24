// Rules from school-eos-website/rnd-linked-account-switching.md:
// R1 only admin-mapped accounts, R2 add once, R3 switch back only over existing links,
// R4 a leaked faculty password alone reaches nothing else.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountLinkService, MAX_LINKED_DEVICES } from './account-link.service';
import { hashToken } from './identity.util';

const OWNER = 'p-faculty';
const CLASS = 'p-class-5b';
const OTHER = 'p-other-class';
const DEVICE_A = 'device-aaaaaaaa';
const DEVICE_B = 'device-bbbbbbbb';
const RT = 'owner-refresh-token';
const dev = (deviceId: string | null) => ({ ipAddress: '1.1.1.1', userAgent: 'jest', deviceId });

async function build() {
  const classHash = await argon2.hash('ClassPass#1');
  const liveSession = {
    id: 's-owner',
    personId: OWNER,
    refreshTokenHash: hashToken(RT),
    devicePlatform: 'ANDROID' as const,
    deviceLabel: 'Pixel',
    deviceId: DEVICE_A,
    linkedFromSessionId: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
  };
  const client = { tag: 'tx' };
  const linkRepo = {
    isCurrentHolder: jest.fn().mockResolvedValue(true),
    findSeatLabel: jest.fn().mockResolvedValue('5-B'),
    countOtherActiveDevices: jest.fn().mockResolvedValue(0),
    createOrTouch: jest.fn().mockResolvedValue({ id: 'link-1' }),
    findActiveBetween: jest.fn().mockResolvedValue({ id: 'link-1', ownerPersonId: OWNER, linkedPersonId: CLASS }),
    revokeById: jest.fn().mockResolvedValue(1),
    touch: jest.fn().mockResolvedValue(undefined),
    revokeIdle: jest.fn().mockResolvedValue(0),
    listLinkedHere: jest.fn().mockResolvedValue([
      { linkedPersonId: CLASS, gradeName: '5', sectionName: 'B', email: 'classadvisor5b@sis.in', linkedOnThisDevice: true },
    ]),
    countRecentAddFailures: jest.fn().mockResolvedValue(0),
    listForOwner: jest.fn().mockResolvedValue([]),
    findOwnedById: jest.fn().mockResolvedValue({ id: 'link-1' }),
  };
  const sessionRepo = {
    findByRefreshTokenHash: jest.fn().mockResolvedValue(liveSession),
    findChild: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    deleteById: jest.fn().mockResolvedValue(undefined),
  };
  const credRepo = {
    findByPersonId: jest.fn().mockResolvedValue({ passwordHash: classHash, lockedUntil: null }),
    recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
    recordSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
  };
  const loginRepo = { findVerifiedByValue: jest.fn().mockResolvedValue({ personId: CLASS }) };
  const personRepo = { findById: jest.fn().mockResolvedValue({ id: CLASS, status: 'ACTIVE' }) };
  const identity = {
    issueSession: jest.fn().mockResolvedValue({
      sessionId: 's-new',
      accessToken: 'at',
      refreshToken: 'rt',
      person: { id: CLASS },
      roles: [],
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const uow = { run: jest.fn(async (fn: (c: unknown) => unknown) => fn(client)) };
  const config = { get: jest.fn().mockReturnValue(5) };
  const service = new AccountLinkService(
    linkRepo as never,
    sessionRepo as never,
    credRepo as never,
    loginRepo as never,
    personRepo as never,
    identity as never,
    uow as never,
    config as never,
    audit as never,
  );
  return { service, linkRepo, sessionRepo, credRepo, loginRepo, identity, audit, uow, client, liveSession };
}

const linkDto = (over: Record<string, unknown> = {}) => ({
  identifier: 'classadvisor5b@sis.in',
  password: 'ClassPass#1',
  refreshToken: RT,
  ...over,
});

describe('AccountLinkService.link (first-time add)', () => {
  it('creates the link and a switched-in session when mapped + class password correct', async () => {
    const t = await build();
    const res = await t.service.link(OWNER, linkDto() as never, dev(DEVICE_A));
    expect(res.accessToken).toBe('at');
    expect(res.linkedLabel).toBe('5-B');
    expect(t.linkRepo.createOrTouch).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPersonId: OWNER, linkedPersonId: CLASS, deviceId: DEVICE_A }),
      t.client,
    );
    expect(t.identity.issueSession).toHaveBeenCalledWith(
      CLASS,
      expect.objectContaining({ deviceId: DEVICE_A, linkedFromSessionId: 's-owner' }),
      expect.anything(),
      t.client,
    );
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_LINK_CREATED' }), t.client);
  });

  it('R1: refuses a login the admin did not map to this person -- generic 401, password never checked', async () => {
    const t = await build();
    t.loginRepo.findVerifiedByValue.mockResolvedValue({ personId: OTHER });
    t.linkRepo.isCurrentHolder.mockResolvedValue(false);
    await expect(t.service.link(OWNER, linkDto({ identifier: 'other@sis.in' }) as never, dev(DEVICE_A))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(t.credRepo.findByPersonId).not.toHaveBeenCalled();
    expect(t.linkRepo.createOrTouch).not.toHaveBeenCalled();
    expect(t.identity.issueSession).not.toHaveBeenCalled();
  });

  it('an unknown email gets the SAME generic 401 (cannot probe which logins exist)', async () => {
    const t = await build();
    t.loginRepo.findVerifiedByValue.mockResolvedValue(null);
    const err = await t.service.link(OWNER, linkDto({ identifier: 'nobody@sis.in' }) as never, dev(DEVICE_A)).catch((e) => e);
    t.loginRepo.findVerifiedByValue.mockResolvedValue({ personId: OTHER });
    t.linkRepo.isCurrentHolder.mockResolvedValue(false);
    const err2 = await t.service.link(OWNER, linkDto({ identifier: 'other@sis.in' }) as never, dev(DEVICE_A)).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toBe((err2 as Error).message);
  });

  it('R4: a leaked faculty password is not enough -- wrong class password is refused and audited', async () => {
    const t = await build();
    await expect(t.service.link(OWNER, linkDto({ password: 'guess' }) as never, dev(DEVICE_A))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // a faculty session must NOT be able to lock the class login out
    expect(t.credRepo.recordFailedAttempt).not.toHaveBeenCalled();
    expect(t.linkRepo.createOrTouch).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_LINK_DENIED', afterData: expect.objectContaining({ reason: 'WRONG_PASSWORD' }) }),
    );
  });

  it('refuses while the class login is locked', async () => {
    const t = await build();
    t.credRepo.findByPersonId.mockResolvedValue({ passwordHash: 'x', lockedUntil: new Date(Date.now() + 60_000) });
    await expect(t.service.link(OWNER, linkDto() as never, dev(DEVICE_A))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.credRepo.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('R4: a session from ANOTHER phone cannot add (session is bound to its device)', async () => {
    const t = await build();
    await expect(t.service.link(OWNER, linkDto() as never, dev(DEVICE_B))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.linkRepo.createOrTouch).not.toHaveBeenCalled();
  });

  it('refuses a refresh token that belongs to someone else', async () => {
    const t = await build();
    t.sessionRepo.findByRefreshTokenHash.mockResolvedValue({ ...t.liveSession, personId: 'p-someone-else' });
    await expect(t.service.link(OWNER, linkDto() as never, dev(DEVICE_A))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cool-off: 5 refused attempts from THIS phone => 429, without even looking the email up', async () => {
    const t = await build();
    t.linkRepo.countRecentAddFailures.mockImplementation(async (_o: string, _m: number, dev: string | null) => (dev ? 5 : 5));
    const err = await t.service.link(OWNER, linkDto() as never, dev(DEVICE_A)).catch((e) => e);
    expect(err.getStatus?.()).toBe(429);
    expect(t.loginRepo.findVerifiedByValue).not.toHaveBeenCalled();
    expect(t.credRepo.findByPersonId).not.toHaveBeenCalled();
  });

  it('cool-off is per phone: 4 refusals here + a burst elsewhere does NOT block this phone', async () => {
    const t = await build();
    // this phone: 0 failures; the same person elsewhere: 12 (below the person-wide ceiling)
    t.linkRepo.countRecentAddFailures.mockImplementation(async (_o: string, _m: number, dev: string | null) => (dev ? 0 : 12));
    const res = await t.service.link(OWNER, linkDto() as never, dev(DEVICE_A));
    expect(res.accessToken).toBe('at');
  });

  it('cool-off: the person-wide ceiling stops device-hopping', async () => {
    const t = await build();
    t.linkRepo.countRecentAddFailures.mockImplementation(async (_o: string, _m: number, dev: string | null) => (dev ? 0 : 20));
    const err = await t.service.link(OWNER, linkDto() as never, dev(DEVICE_A)).catch((e) => e);
    expect(err.getStatus?.()).toBe(429);
  });

  it('requires a device id (older app builds are told to update)', async () => {
    const t = await build();
    await expect(t.service.link(OWNER, linkDto() as never, dev(null))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the per-person phone limit', async () => {
    const t = await build();
    t.linkRepo.countOtherActiveDevices.mockResolvedValue(MAX_LINKED_DEVICES);
    await expect(t.service.link(OWNER, linkDto() as never, dev(DEVICE_A))).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AccountLinkService.switchTo', () => {
  const swDto = (over: Record<string, unknown> = {}) => ({ targetPersonId: CLASS, refreshToken: RT, ...over });

  it('switches out over an active link on this phone, minting a child session (no password)', async () => {
    const t = await build();
    const res = await t.service.switchTo(OWNER, swDto() as never, dev(DEVICE_A));
    expect(res.accessToken).toBe('at');
    expect(t.identity.issueSession).toHaveBeenCalledWith(
      CLASS,
      expect.objectContaining({ linkedFromSessionId: 's-owner', rotateSessionId: null }),
      expect.anything(),
      t.client,
    );
    expect(t.credRepo.findByPersonId).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_LINK_USED' }), t.client);
  });

  it('R4: refuses on a phone with no link (attacker phone with the faculty password only)', async () => {
    const t = await build();
    t.linkRepo.findActiveBetween.mockResolvedValue(null);
    await expect(t.service.switchTo(OWNER, swDto() as never, dev(DEVICE_A))).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.identity.issueSession).not.toHaveBeenCalled();
  });

  it('refuses and revokes when the admin has since changed the teacher', async () => {
    const t = await build();
    t.linkRepo.isCurrentHolder.mockResolvedValue(false);
    await expect(t.service.switchTo(OWNER, swDto() as never, dev(DEVICE_A))).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.linkRepo.revokeById).toHaveBeenCalledWith('link-1', 'MAPPING_ENDED');
  });

  it('refuses without a live session on this phone', async () => {
    const t = await build();
    t.sessionRepo.findByRefreshTokenHash.mockResolvedValue(null);
    await expect(t.service.switchTo(OWNER, swDto() as never, dev(DEVICE_A))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('R3: switching BACK reuses the parent session and drops the class session', async () => {
    const t = await build();
    const child = { ...t.liveSession, id: 's-class', personId: CLASS, linkedFromSessionId: 's-owner' };
    t.sessionRepo.findByRefreshTokenHash.mockResolvedValue(child);
    t.sessionRepo.findById.mockResolvedValue({ ...t.liveSession, id: 's-owner', personId: OWNER });
    t.linkRepo.findActiveBetween.mockResolvedValue({ id: 'link-1', ownerPersonId: OWNER, linkedPersonId: CLASS });
    await t.service.switchTo(CLASS, { targetPersonId: OWNER, refreshToken: RT } as never, dev(DEVICE_A));
    expect(t.identity.issueSession).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({ rotateSessionId: 's-owner' }),
      expect.anything(),
      t.client,
    );
    expect(t.sessionRepo.deleteById).toHaveBeenCalledWith('s-class', t.client);
  });

  it('R3: a switched-in session cannot go anywhere except back where it came from', async () => {
    const t = await build();
    const child = { ...t.liveSession, id: 's-class', personId: CLASS, linkedFromSessionId: 's-owner' };
    t.sessionRepo.findByRefreshTokenHash.mockResolvedValue(child);
    t.sessionRepo.findById.mockResolvedValue({ ...t.liveSession, id: 's-owner', personId: OWNER });
    await expect(
      t.service.switchTo(CLASS, { targetPersonId: OTHER, refreshToken: RT } as never, dev(DEVICE_A)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.identity.issueSession).not.toHaveBeenCalled();
  });

  it('refuses to "switch" to the account already in use', async () => {
    const t = await build();
    await expect(t.service.switchTo(OWNER, swDto({ targetPersonId: OWNER }) as never, dev(DEVICE_A))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AccountLinkService.available / remove', () => {
  it('lists ONLY classes already added on this phone (with their email)', async () => {
    const t = await build();
    const list = await t.service.available(OWNER, dev(DEVICE_A));
    expect(list).toEqual([
      { linkedPersonId: CLASS, label: '5-B', email: 'classadvisor5b@sis.in', emailHint: `cl${'*'.repeat(12)}@sis.in`, linkedOnThisDevice: true },
    ]);
  });

  it('a phone that has added nothing (e.g. a leaked Faculty password) learns nothing: empty list', async () => {
    const t = await build();
    t.linkRepo.listLinkedHere.mockResolvedValue([]);
    expect(await t.service.available(OWNER, dev(DEVICE_B))).toEqual([]);
  });

  it('no device id => empty list', async () => {
    const t = await build();
    t.linkRepo.listLinkedHere.mockResolvedValue([]);
    expect(await t.service.available(OWNER, dev(null))).toEqual([]);
  });

  it('remove revokes one link and audits it; someone else\'s link is a 404', async () => {
    const t = await build();
    await t.service.remove(OWNER, 'link-1');
    expect(t.linkRepo.revokeById).toHaveBeenCalledWith('link-1', 'OWNER_REMOVED');
    t.linkRepo.findOwnedById.mockResolvedValue(null);
    await expect(t.service.remove(OWNER, 'link-2')).rejects.toThrow();
  });
});
