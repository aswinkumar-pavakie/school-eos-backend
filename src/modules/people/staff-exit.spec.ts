// Leaving the school must end access, not just flip a status column.

import { BadRequestException } from '@nestjs/common';
import { StaffService } from './staff.service';

const PERSON = 'p-teacher';
const ADMIN = 'p-admin';
const SEAT = 'p-class-login';

function build(seats: string[]) {
  const client = { tag: 'tx' };
  const staff = { id: 's1', personId: PERSON, status: 'ACTIVE' };
  const staffRepo = {
    findById: jest.fn().mockResolvedValue(staff),
    exit: jest.fn().mockResolvedValue({ ...staff, status: 'EXITED' }),
    findHeldClassLogins: jest.fn().mockResolvedValue(seats),
    releaseClassSeats: jest.fn().mockResolvedValue(undefined),
    revokeAllRoles: jest.fn().mockResolvedValue(undefined),
    removeDeviceTokens: jest.fn().mockResolvedValue(undefined),
  };
  const credRepo = { setSharedLoginPassword: jest.fn().mockResolvedValue(undefined), findByPersonId: jest.fn().mockResolvedValue(null) };
  const loginIdRepo = { findByPersonId: jest.fn().mockResolvedValue([]) };
  const sessionRepo = { deleteAllForPerson: jest.fn().mockResolvedValue(undefined) };
  const linkRepo = { revokeForOwner: jest.fn().mockResolvedValue(0), revokeForLinked: jest.fn().mockResolvedValue(0) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const uow = { run: jest.fn(async (fn: (c: unknown) => unknown) => fn(client)) };
  const service = new StaffService(
    staffRepo as never,
    {} as never,
    loginIdRepo as never,
    credRepo as never,
    audit as never,
    sessionRepo as never,
    uow as never,
    linkRepo as never,
  );
  return { service, staffRepo, credRepo, sessionRepo, linkRepo, audit, uow, client };
}

describe('StaffService.exit', () => {
  it('revokes roles, signs the person out everywhere, in one transaction', async () => {
    const t = build([]);
    await t.service.exit('s1', { exitReason: 'Resigned' } as never, ADMIN);
    expect(t.uow.run).toHaveBeenCalledTimes(1);
    expect(t.staffRepo.revokeAllRoles).toHaveBeenCalledWith(PERSON, ADMIN, t.client);
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalledWith(PERSON, t.client);
    expect(t.staffRepo.removeDeviceTokens).toHaveBeenCalledWith(PERSON, t.client);
    expect(t.credRepo.setSharedLoginPassword).not.toHaveBeenCalled();
    expect(t.linkRepo.revokeForOwner).toHaveBeenCalledWith(PERSON, 'STAFF_EXITED', null, t.client);
  });

  it('releases a held class seat and renews its shared password so the leaver cannot use it', async () => {
    const t = build([SEAT]);
    await t.service.exit('s1', { exitReason: 'Resigned' } as never, ADMIN);
    expect(t.staffRepo.releaseClassSeats).toHaveBeenCalledWith(PERSON, ADMIN, t.client);
    expect(t.credRepo.setSharedLoginPassword).toHaveBeenCalledWith(SEAT, expect.any(String), expect.any(String), t.client);
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalledWith(SEAT, t.client);
    expect(t.linkRepo.revokeForLinked).toHaveBeenCalledWith(SEAT, 'TEACHER_CHANGED', t.client);
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAFF_EXITED',
        afterData: expect.objectContaining({ releasedClassLogins: [SEAT] }),
      }),
    );
  });

  it('refuses a staff member who has already exited, changing nothing', async () => {
    const t = build([]);
    t.staffRepo.findById.mockResolvedValue({ id: 's1', personId: PERSON, status: 'EXITED' });
    await expect(t.service.exit('s1', { exitReason: 'x' } as never, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });
});
