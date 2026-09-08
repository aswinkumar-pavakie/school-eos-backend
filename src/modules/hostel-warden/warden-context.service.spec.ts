import { ForbiddenException } from '@nestjs/common';
import { WardenContextService } from './warden-context.service';

function buildService(opts: {
  staff?: { id: string; personId: string; status: string } | null;
  hostelIds?: string[];
}) {
  const staffRepo = {
    findByPersonId: jest
      .fn()
      .mockResolvedValue(
        opts.staff === undefined
          ? { id: 'staff-1', personId: 'person-1', status: 'ACTIVE' }
          : opts.staff,
      ),
  } as any;
  const wardenAssignmentRepo = {
    findActiveHostelIdsForPerson: jest
      .fn()
      .mockResolvedValue(opts.hostelIds ?? ['hostel-1']),
  } as any;
  const service = new WardenContextService(staffRepo, wardenAssignmentRepo);
  return { service, staffRepo, wardenAssignmentRepo };
}

describe('WardenContextService.requireActiveWarden', () => {
  // 1. Active Hostel Warden succeeds.
  it('returns staffId/personId/hostelIds for an active staff member with an active HOSTEL_WARDEN assignment', async () => {
    const { service } = buildService({ hostelIds: ['hostel-1', 'hostel-2'] });
    const ctx = await service.requireActiveWarden('person-1');
    expect(ctx).toEqual({
      staffId: 'staff-1',
      personId: 'person-1',
      hostelIds: ['hostel-1', 'hostel-2'],
    });
  });

  // 2/3. Non-Warden / inactive staff rejected -- no staff record, or a staff record
  // that exists but isn't ACTIVE, both fail the same way.
  it('rejects when the caller has no staff record at all', async () => {
    const { service } = buildService({ staff: null });
    await expect(service.requireActiveWarden('person-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects when the caller's staff record is not ACTIVE (e.g. EXITED)", async () => {
    const { service } = buildService({
      staff: { id: 'staff-1', personId: 'person-1', status: 'EXITED' },
    });
    await expect(service.requireActiveWarden('person-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  // 4. Warden without a hostel assignment rejected.
  it('rejects when the caller has no ACTIVE HOSTEL_WARDEN role_assignment for any hostel', async () => {
    const { service } = buildService({ hostelIds: [] });
    await expect(service.requireActiveWarden('person-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  // 5/6. Client-supplied wardenId/hostelId are structurally impossible to spoof --
  // requireActiveWarden takes only the JWT-derived personId and re-derives everything
  // else server-side; it never accepts a staffId/hostelId parameter to begin with.
  it('resolves identity purely from the given personId, never from any other input', async () => {
    const { service, staffRepo, wardenAssignmentRepo } = buildService({});
    await service.requireActiveWarden('person-1');
    expect(staffRepo.findByPersonId).toHaveBeenCalledWith('person-1');
    expect(
      wardenAssignmentRepo.findActiveHostelIdsForPerson,
    ).toHaveBeenCalledWith('person-1');
  });
});
