// Behaviour of the class-teacher-login admin service: what a hand-over, a
// vacate, a password action and a year rollover must (and must not) do.
// Design: school-eos-website/rnd-class-teacher-logins-admin.md.

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClassTeacherLoginService } from './class-teacher-login.service';
import { computeSeatStatus } from './class-teacher-seat-status.util';
import type { ClassLoginSeatRow } from './repositories/class-teacher-login.repository';

const LOGIN = '11111111-1111-4111-8111-111111111111';
const FACULTY_A = '22222222-2222-4222-8222-222222222222';
const FACULTY_B = '33333333-3333-4333-8333-333333333333';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const GRADE = '55555555-5555-4555-8555-555555555555';
const SEC_OLD = '66666666-6666-4666-8666-666666666666';
const SEC_NEW = '77777777-7777-4777-8777-777777777777';
const YEAR_NEW = '88888888-8888-4888-8888-888888888888';

function seat(over: Partial<ClassLoginSeatRow> = {}): ClassLoginSeatRow {
  return {
    loginPersonId: LOGIN,
    gradeId: GRADE,
    gradeName: '1',
    sectionName: 'A',
    email: 'classadvisor1a@sis.in',
    holderPersonId: FACULTY_A,
    holderName: 'Vikram K',
    holderEmployeeNo: 'EMP1',
    holderStaffStatus: 'ACTIVE',
    holderSince: new Date('2026-06-01'),
    roleSectionId: SEC_OLD,
    targetSectionId: SEC_NEW,
    studentCount: 24,
    hasStoredPassword: true,
    linkedPhones: 0,
    ...over,
  };
}

function build() {
  const client = { tag: 'tx' };
  const repo = {
    findById: jest.fn().mockResolvedValue({ loginPersonId: LOGIN, gradeId: GRADE, sectionName: 'A' }),
    findActiveAssignment: jest.fn().mockResolvedValue({ facultyPersonId: FACULTY_A, sectionId: SEC_OLD }),
    endActiveAssignment: jest.fn().mockResolvedValue(undefined),
    createAssignment: jest.fn().mockResolvedValue({ id: 'asg-new' }),
    lockLogin: jest.fn().mockResolvedValue(true),
    isEligibleFaculty: jest.fn().mockResolvedValue(true),
    findActiveSeatHeldBy: jest.fn().mockResolvedValue(null),
    readStoredPassword: jest.fn().mockResolvedValue('Stored#123'),
    findCurrentAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_NEW, name: '2027-28' }),
    findAcademicYear: jest.fn().mockResolvedValue({ id: YEAR_NEW, name: '2027-28', status: 'ACTIVE' }),
    listSeats: jest.fn().mockResolvedValue([seat()]),
    listSectionsWithoutLogin: jest.fn().mockResolvedValue([]),
  };
  const sectionRepo = {
    findById: jest.fn().mockResolvedValue({ id: SEC_NEW, gradeId: GRADE, name: 'A', academicYearId: YEAR_NEW }),
  };
  const personRepo = { findById: jest.fn().mockResolvedValue({ id: FACULTY_B }) };
  const roleRepo = {
    findMany: jest.fn().mockResolvedValue([{ id: 'role-old' }]),
    revoke: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: 'role-new' }),
  };
  const credRepo = { setSharedLoginPassword: jest.fn().mockResolvedValue(undefined), markSharedLogin: jest.fn() };
  const sessionRepo = { deleteAllForPerson: jest.fn().mockResolvedValue(undefined) };
  const deviceRepo = { removeAllForPerson: jest.fn().mockResolvedValue(undefined) };
  const linkRepo = { revokeForLinked: jest.fn().mockResolvedValue(0) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const uow = { run: jest.fn(async (fn: (c: unknown) => unknown) => fn(client)) };

  const service = new ClassTeacherLoginService(
    personRepo as never,
    {} as never,
    credRepo as never,
    roleRepo as never,
    sectionRepo as never,
    {} as never,
    repo as never,
    sessionRepo as never,
    deviceRepo as never,
    linkRepo as never,
    uow as never,
    audit as never,
  );
  return { service, repo, sectionRepo, personRepo, roleRepo, credRepo, sessionRepo, deviceRepo, linkRepo, audit, uow, client };
}

describe('computeSeatStatus', () => {
  const base = { hasHolder: true, holderStaffStatus: 'ACTIVE', targetSectionId: SEC_NEW, roleSectionId: SEC_NEW };
  it('is ACTIVE when a live holder and the current-year section line up', () => {
    expect(computeSeatStatus(base)).toBe('ACTIVE');
  });
  it('is NO_SECTION_THIS_YEAR when the year has no matching section, even with a holder', () => {
    expect(computeSeatStatus({ ...base, targetSectionId: null })).toBe('NO_SECTION_THIS_YEAR');
  });
  it('is VACANT when nobody holds the seat', () => {
    expect(computeSeatStatus({ ...base, hasHolder: false, holderStaffStatus: null })).toBe('VACANT');
  });
  it('is NEEDS_ROLLOVER when the role still points at an older year', () => {
    expect(computeSeatStatus({ ...base, roleSectionId: SEC_OLD })).toBe('NEEDS_ROLLOVER');
  });
  it('is HOLDER_INACTIVE when the holder has left / is on leave', () => {
    expect(computeSeatStatus({ ...base, holderStaffStatus: 'EXITED' })).toBe('HOLDER_INACTIVE');
    expect(computeSeatStatus({ ...base, holderStaffStatus: 'ON_LEAVE' })).toBe('HOLDER_INACTIVE');
  });
  it('checks "needs rollover" before "holder inactive"', () => {
    expect(computeSeatStatus({ ...base, roleSectionId: SEC_OLD, holderStaffStatus: 'EXITED' })).toBe('NEEDS_ROLLOVER');
  });
});

describe('reassign (change class teacher)', () => {
  const dto = { sectionId: SEC_NEW, facultyPersonId: FACULTY_B };

  it('rotates the password, cuts the previous holder off everywhere, and returns the new password once', async () => {
    const t = build();
    const result = await t.service.reassign(LOGIN, dto, ADMIN);

    expect(result.reassigned).toBe(true);
    expect(typeof result.newPassword).toBe('string');
    expect(result.newPassword!.length).toBeGreaterThanOrEqual(8);
    expect(t.repo.lockLogin).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.deviceRepo.removeAllForPerson).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.credRepo.setSharedLoginPassword).toHaveBeenCalledWith(LOGIN, expect.any(String), result.newPassword, t.client);
    expect(t.repo.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ classTeacherLoginId: LOGIN, sectionId: SEC_NEW, facultyPersonId: FACULTY_B }),
      t.client,
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLASS_TEACHER_LOGIN_REASSIGNED',
        afterData: expect.objectContaining({ previousHolderPersonId: FACULTY_A, passwordRotated: true }),
      }),
      t.client,
    );
  });

  it('still cuts the previous holder off when the password is deliberately kept', async () => {
    const t = build();
    const result = await t.service.reassign(LOGIN, { ...dto, rotatePassword: false }, ADMIN);
    expect(result.newPassword).toBeUndefined();
    expect(t.credRepo.setSharedLoginPassword).not.toHaveBeenCalled();
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalled();
    expect(t.deviceRepo.removeAllForPerson).toHaveBeenCalled();
  });

  it('revokes the old advisor role before granting the new one', async () => {
    const t = build();
    await t.service.reassign(LOGIN, dto, ADMIN);
    expect(t.roleRepo.revoke).toHaveBeenCalledWith('role-old', ADMIN, t.client);
    expect(t.roleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ personId: LOGIN, roleCode: 'CLASS_ADVISOR', scopeId: SEC_NEW }),
      t.client,
    );
  });

  it('refuses someone who is not an active faculty member, changing nothing', async () => {
    const t = build();
    t.repo.isEligibleFaculty.mockResolvedValue(false);
    await expect(t.service.reassign(LOGIN, dto, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.uow.run).not.toHaveBeenCalled();
    expect(t.sessionRepo.deleteAllForPerson).not.toHaveBeenCalled();
  });

  it('refuses a teacher who already holds a DIFFERENT class (one class per teacher)', async () => {
    const t = build();
    t.repo.findActiveSeatHeldBy.mockResolvedValue({ loginPersonId: 'other-login', gradeName: '2', sectionName: 'C' });
    await expect(t.service.reassign(LOGIN, dto, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });

  it('refuses to "change" to the person who already holds that class', async () => {
    const t = build();
    t.repo.findActiveAssignment.mockResolvedValue({ facultyPersonId: FACULTY_B, sectionId: SEC_NEW });
    await expect(t.service.reassign(LOGIN, dto, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });

  it('refuses a section that is a different class than the login', async () => {
    const t = build();
    t.sectionRepo.findById.mockResolvedValue({ id: SEC_NEW, gradeId: GRADE, name: 'B', academicYearId: YEAR_NEW });
    await expect(t.service.reassign(LOGIN, dto, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });

  it('404s for an unknown login', async () => {
    const t = build();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.service.reassign(LOGIN, dto, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fills a vacant seat (no previous holder)', async () => {
    const t = build();
    t.repo.findActiveAssignment.mockResolvedValue(null);
    const result = await t.service.reassign(LOGIN, dto, ADMIN);
    expect(result.reassigned).toBe(true);
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ afterData: expect.objectContaining({ previousHolderPersonId: null }) }),
      t.client,
    );
  });
});

describe('vacate', () => {
  it('ends the assignment, cuts access and rotates the password', async () => {
    const t = build();
    await t.service.vacate(LOGIN, ADMIN);
    expect(t.repo.endActiveAssignment).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.deviceRepo.removeAllForPerson).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.credRepo.setSharedLoginPassword).toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_LOGIN_VACATED' }), t.client);
  });
  it('refuses when the seat is already vacant', async () => {
    const t = build();
    t.repo.findActiveAssignment.mockResolvedValue(null);
    await expect(t.service.vacate(LOGIN, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });
});

describe('password actions', () => {
  it('setPassword stores the chosen password, signs out sessions but keeps devices', async () => {
    const t = build();
    const r = await t.service.setPassword(LOGIN, { newPassword: 'MyChosen#99' }, ADMIN);
    expect(r.newPassword).toBe('MyChosen#99');
    expect(t.credRepo.setSharedLoginPassword).toHaveBeenCalledWith(LOGIN, expect.any(String), 'MyChosen#99', t.client);
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalled();
    expect(t.deviceRepo.removeAllForPerson).not.toHaveBeenCalled();
  });
  it('setPassword generates a password when none is given', async () => {
    const t = build();
    const r = await t.service.setPassword(LOGIN, {}, ADMIN);
    expect(r.newPassword.length).toBeGreaterThanOrEqual(8);
  });
  it('revealPassword returns the stored password and writes an audit event', async () => {
    const t = build();
    const r = await t.service.revealPassword(LOGIN, ADMIN);
    expect(r.password).toBe('Stored#123');
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_LOGIN_PASSWORD_REVEALED', actorPersonId: ADMIN }));
  });
  it('revealPassword does not audit (or invent) a password that is not stored', async () => {
    const t = build();
    t.repo.readStoredPassword.mockResolvedValue(null);
    await expect(t.service.revealPassword(LOGIN, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(t.audit.record).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('reports each seat with a status and a summary, and never a password', async () => {
    const t = build();
    t.repo.listSeats.mockResolvedValue([
      seat({ roleSectionId: SEC_NEW }),
      seat({ loginPersonId: 'l2', holderPersonId: null, holderName: null, holderStaffStatus: null }),
      seat({ loginPersonId: 'l3' }),
      seat({ loginPersonId: 'l4', targetSectionId: null }),
      seat({ loginPersonId: 'l5', roleSectionId: SEC_NEW, holderStaffStatus: 'EXITED' }),
    ]);
    const r = await t.service.list({});
    expect(r.summary).toEqual({ total: 5, active: 1, vacant: 1, needsRollover: 1, noSectionThisYear: 1, holderInactive: 1 });
    expect(JSON.stringify(r)).not.toMatch(/password/i.source === 'password' ? /"password"/ : /x^/);
    expect(r.seats.every((s) => !('password' in s))).toBe(true);
  });
  it('404s for an unknown academic year', async () => {
    const t = build();
    t.repo.findAcademicYear.mockResolvedValue(null);
    await expect(t.service.list({ academicYearId: YEAR_NEW })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('year rollover', () => {
  it('previews: moves a seat whose role points at an older year, skips aligned and section-less seats', async () => {
    const t = build();
    t.repo.listSeats.mockResolvedValue([
      seat(), // needs move
      seat({ loginPersonId: 'l2', roleSectionId: SEC_NEW }), // already aligned
      seat({ loginPersonId: 'l3', targetSectionId: null }), // no section next year
      seat({ loginPersonId: 'l4', holderPersonId: null, holderName: null }), // move, stays vacant
    ]);
    const p = await t.service.rolloverPreview(YEAR_NEW);
    expect(p.summary).toEqual({ toMove: 2, alreadyAligned: 1, noSectionThisYear: 1, staysVacant: 1, sectionsWithoutLogin: 0 });
    expect(p.items.map((i) => i.action)).toEqual(['MOVE', 'ALREADY_ALIGNED', 'SKIP_NO_SECTION', 'MOVE']);
  });

  it('apply keeps each seat\'s teacher and password by default, in one transaction', async () => {
    const t = build();
    const r = await t.service.rolloverApply({ targetAcademicYearId: YEAR_NEW }, ADMIN);
    expect(r.moved).toBe(1);
    expect(t.uow.run).toHaveBeenCalledTimes(1);
    expect(t.roleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ scopeId: SEC_NEW, academicYearId: YEAR_NEW }), t.client);
    expect(t.repo.createAssignment).toHaveBeenCalledWith(expect.objectContaining({ facultyPersonId: FACULTY_A, sectionId: SEC_NEW }), t.client);
    expect(t.credRepo.setSharedLoginPassword).not.toHaveBeenCalled();
    expect(t.sessionRepo.deleteAllForPerson).not.toHaveBeenCalled();
  });

  it('apply treats a changed teacher as a hand-over (rotate + cut previous holder off)', async () => {
    const t = build();
    await t.service.rolloverApply(
      { targetAcademicYearId: YEAR_NEW, overrides: [{ loginPersonId: LOGIN, facultyPersonId: FACULTY_B }] },
      ADMIN,
    );
    expect(t.repo.createAssignment).toHaveBeenCalledWith(expect.objectContaining({ facultyPersonId: FACULTY_B }), t.client);
    expect(t.credRepo.setSharedLoginPassword).toHaveBeenCalled();
    expect(t.sessionRepo.deleteAllForPerson).toHaveBeenCalledWith(LOGIN, t.client);
    expect(t.deviceRepo.removeAllForPerson).toHaveBeenCalledWith(LOGIN, t.client);
  });

  it('apply with rotatePasswords rotates every moved seat without dropping devices when the teacher is unchanged', async () => {
    const t = build();
    await t.service.rolloverApply({ targetAcademicYearId: YEAR_NEW, rotatePasswords: true }, ADMIN);
    expect(t.credRepo.setSharedLoginPassword).toHaveBeenCalledTimes(1);
    expect(t.deviceRepo.removeAllForPerson).not.toHaveBeenCalled();
  });

  it('apply rejects an ineligible new teacher before changing anything', async () => {
    const t = build();
    t.repo.isEligibleFaculty.mockResolvedValue(false);
    await expect(
      t.service.rolloverApply(
        { targetAcademicYearId: YEAR_NEW, overrides: [{ loginPersonId: LOGIN, facultyPersonId: FACULTY_B }] },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });

  it('apply is safe to re-run: aligned seats are not touched again', async () => {
    const t = build();
    t.repo.listSeats.mockResolvedValue([seat({ roleSectionId: SEC_NEW })]);
    const r = await t.service.rolloverApply({ targetAcademicYearId: YEAR_NEW }, ADMIN);
    expect(r.moved).toBe(0);
    expect(t.roleRepo.create).not.toHaveBeenCalled();
    expect(t.repo.createAssignment).not.toHaveBeenCalled();
  });

  it('apply moves a vacant seat\'s login without inventing a teacher', async () => {
    const t = build();
    t.repo.listSeats.mockResolvedValue([seat({ holderPersonId: null, holderName: null })]);
    const r = await t.service.rolloverApply({ targetAcademicYearId: YEAR_NEW }, ADMIN);
    expect(r.moved).toBe(1);
    expect(t.roleRepo.create).toHaveBeenCalled();
    expect(t.repo.createAssignment).not.toHaveBeenCalled();
  });
});
