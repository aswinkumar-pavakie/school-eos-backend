import { NotFoundException } from '@nestjs/common';
import { RoomBedViewService } from './room-bed-view.service';

const CTX = {
  staffId: 'staff-1',
  personId: 'warden-1',
  hostelIds: ['hostel-1'],
};

function buildService(
  opts: {
    allocations?: any[];
    blocks?: any[];
    floors?: any[];
    rooms?: any[];
    guardians?: any[];
  } = {},
) {
  const wardenContext = {
    requireActiveWarden: jest.fn().mockResolvedValue(CTX),
  } as any;
  const hostelAllocationRepo = {
    findMany: jest
      .fn()
      .mockResolvedValue(
        opts.allocations ?? [
          { id: 'alloc-1', studentId: 'student-1', hostelName: 'Block A' },
        ],
      ),
  } as any;
  const hostelBlockRepo = {
    findByHostelId: jest
      .fn()
      .mockResolvedValue(opts.blocks ?? [{ id: 'block-1', name: 'A' }]),
  } as any;
  const hostelFloorRepo = {
    findByBlockId: jest
      .fn()
      .mockResolvedValue(opts.floors ?? [{ id: 'floor-1', floorNo: 1 }]),
  } as any;
  const hostelRoomRepo = {
    findByFloorId: jest
      .fn()
      .mockResolvedValue(opts.rooms ?? [{ id: 'room-1', roomNo: '101' }]),
  } as any;
  const studentGuardianRepo = {
    findActiveGuardians: jest.fn().mockResolvedValue(
      opts.guardians ?? [
        {
          personId: 'parent-1',
          firstName: 'Ravi',
          lastName: 'Kumar',
          relationship: 'Father',
          isPrimaryContact: true,
          mobile: '9000000000',
          photoUrl: null,
        },
      ],
    ),
  } as any;

  const service = new RoomBedViewService(
    wardenContext,
    hostelAllocationRepo,
    hostelBlockRepo,
    hostelFloorRepo,
    hostelRoomRepo,
    studentGuardianRepo,
  );
  return {
    service,
    hostelAllocationRepo,
    hostelBlockRepo,
    hostelFloorRepo,
    hostelRoomRepo,
    studentGuardianRepo,
  };
}

describe('RoomBedViewService', () => {
  // 57. Warden can view allocation.
  it("lists allocations scoped to the caller's own hostel(s), ACTIVE only", async () => {
    const { service, hostelAllocationRepo } = buildService();
    const result = await service.listAllocations('warden-1');
    expect(hostelAllocationRepo.findMany).toHaveBeenCalledWith({
      hostelIds: ['hostel-1'],
      status: 'ACTIVE',
    });
    expect(result).toHaveLength(1);
  });

  // 58. Cross-hostel allocation returns 404.
  it("a student with no allocation in the caller's hostel(s) 404s", async () => {
    const { service } = buildService({ allocations: [] });
    await expect(
      service.getStudentRoom('student-1', 'warden-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns a student's room when they are allocated within the caller's hostel(s)", async () => {
    const { service } = buildService();
    const room = await service.getStudentRoom('student-1', 'warden-1');
    expect(room.id).toBe('alloc-1');
  });

  it("returns a student's active guardians when they're in the caller's hostel", async () => {
    const { service, studentGuardianRepo } = buildService();
    const guardians = await service.getStudentGuardians(
      'student-1',
      'warden-1',
    );
    expect(studentGuardianRepo.findActiveGuardians).toHaveBeenCalledWith(
      'student-1',
    );
    expect(guardians).toHaveLength(1);
    expect(guardians[0].relationship).toBe('Father');
  });

  it("a cross-hostel student's guardians are never revealed (404, guardian query never runs)", async () => {
    const { service, studentGuardianRepo } = buildService({ allocations: [] });
    await expect(
      service.getStudentGuardians('student-1', 'warden-1'),
    ).rejects.toThrow(NotFoundException);
    expect(studentGuardianRepo.findActiveGuardians).not.toHaveBeenCalled();
  });

  it('assembles the block/floor/room tree for the complaint form picker', async () => {
    const { service, hostelBlockRepo } = buildService();
    const blocks = await service.listHostelStructure('warden-1');
    expect(hostelBlockRepo.findByHostelId).toHaveBeenCalledWith('hostel-1');
    expect(blocks).toEqual([
      {
        id: 'block-1',
        name: 'A',
        rooms: [{ id: 'room-1', roomNo: '101', floorNo: 1 }],
      },
    ]);
  });
});

// 59-63. Warden cannot create/allocate/transfer/delete room or bed data -- structurally
// guaranteed, not just tested at runtime: RoomBedViewService only calls findMany/
// findByHostelId/findByBlockId/findByFloorId (all plain SELECTs) across its four
// injected repositories -- it never references create/update/vacate/setStatus
// anywhere in its source (see room-bed-view.service.ts), and RoomBedViewController
// (room-bed-view.controller.ts) declares only @Get routes -- no @Post/@Patch/@Delete
// route exists for any hostel structure resource anywhere in the hostel-warden module.
describe('RoomBedViewService — no write surface', () => {
  it('exposes only read methods', () => {
    const methodNames = Object.getOwnPropertyNames(
      RoomBedViewService.prototype,
    ).filter((n) => n !== 'constructor');
    expect(methodNames.sort()).toEqual([
      'getStudentGuardians',
      'getStudentRoom',
      'listAllocations',
      'listHostelStructure',
    ]);
  });
});
