// A student leaving must free everything they occupied, atomically.

import { BadRequestException } from '@nestjs/common';
import { StudentsService } from './students.service';

function build(status = 'ACTIVE') {
  const client = { tag: 'tx' };
  const studentRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'st1', status }),
    leave: jest.fn().mockResolvedValue({ id: 'st1', status: 'LEFT' }),
    releaseFacilitiesOnLeaving: jest.fn().mockResolvedValue(undefined),
  };
  const enrolmentRepo = { closeActiveForLeaving: jest.fn().mockResolvedValue(1) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const uow = { run: jest.fn(async (fn: (c: unknown) => unknown) => fn(client)) };
  const service = new StudentsService(
    studentRepo as never,
    {} as never,
    audit as never,
    uow as never,
    enrolmentRepo as never,
  );
  // get() is what leave() calls first; stub it to the repo row
  jest.spyOn(service, 'get').mockResolvedValue({ id: 'st1', status } as never);
  return { service, studentRepo, enrolmentRepo, audit, uow, client };
}

describe('StudentsService.leave', () => {
  it('closes the enrolment and releases bed + transport in the same transaction', async () => {
    const t = build();
    await t.service.leave('st1', { status: 'LEFT', dateOfLeaving: '2026-09-01' } as never, 'admin');
    expect(t.uow.run).toHaveBeenCalledTimes(1);
    expect(t.studentRepo.leave).toHaveBeenCalledWith('st1', 'LEFT', '2026-09-01', t.client);
    expect(t.enrolmentRepo.closeActiveForLeaving).toHaveBeenCalledWith('st1', t.client);
    expect(t.studentRepo.releaseFacilitiesOnLeaving).toHaveBeenCalledWith('st1', '2026-09-01', t.client);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STUDENT_LEFT' }));
  });

  it('refuses a student who has already left, changing nothing', async () => {
    const t = build('LEFT');
    await expect(t.service.leave('st1', { status: 'LEFT' } as never, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(t.uow.run).not.toHaveBeenCalled();
  });
});
