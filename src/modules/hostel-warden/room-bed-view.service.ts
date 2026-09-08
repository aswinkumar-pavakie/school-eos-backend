// Feature 8 -- READ ONLY. Reuses the Admin hostel module's own repositories (exported
// read-only from HostelModule) rather than a second copy of the same queries. This
// service never calls create/update/vacate/setStatus on any of them -- there is no
// write path here at all, and no controller route exists for one.

import { Injectable, NotFoundException } from '@nestjs/common';
import { HostelAllocationRepository } from '../hostel/repositories/hostel-allocation.repository';
import { HostelBlockRepository } from '../hostel/repositories/hostel-block.repository';
import { HostelFloorRepository } from '../hostel/repositories/hostel-floor.repository';
import { HostelRoomRepository } from '../hostel/repositories/hostel-room.repository';
import { StudentGuardianRepository } from './repositories/student-guardian.repository';
import { WardenContextService } from './warden-context.service';

export interface HostelStructureRoom {
  id: string;
  roomNo: string;
  floorNo: number;
}

export interface HostelStructureBlock {
  id: string;
  name: string;
  rooms: HostelStructureRoom[];
}

@Injectable()
export class RoomBedViewService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly hostelAllocationRepo: HostelAllocationRepository,
    private readonly hostelBlockRepo: HostelBlockRepository,
    private readonly hostelFloorRepo: HostelFloorRepository,
    private readonly hostelRoomRepo: HostelRoomRepository,
    private readonly studentGuardianRepo: StudentGuardianRepository,
  ) {}

  /** Blocks + rooms (flattened across floors) for the Warden's own hostel(s) --
   * feeds the Hostel Complaints form's block/room picker with real ids, since
   * complaint.block_id/room_id are real FKs, not free text. Small, N+1-shaped
   * (a handful of blocks/floors per hostel), composed entirely from Admin's own
   * already-exported read repositories -- no new SQL, no write path. */
  async listHostelStructure(personId: string): Promise<HostelStructureBlock[]> {
    const ctx = await this.wardenContext.requireActiveWarden(personId);

    const blocks: HostelStructureBlock[] = [];
    for (const hostelId of ctx.hostelIds) {
      const hostelBlocks = await this.hostelBlockRepo.findByHostelId(hostelId);
      for (const block of hostelBlocks) {
        const floors = await this.hostelFloorRepo.findByBlockId(block.id);
        const rooms: HostelStructureRoom[] = [];
        for (const floor of floors) {
          const floorRooms = await this.hostelRoomRepo.findByFloorId(floor.id);
          for (const room of floorRooms) {
            rooms.push({
              id: room.id,
              roomNo: room.roomNo,
              floorNo: floor.floorNo,
            });
          }
        }
        blocks.push({ id: block.id, name: block.name, rooms });
      }
    }
    return blocks;
  }

  async listAllocations(personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.hostelAllocationRepo.findMany({
      hostelIds: ctx.hostelIds,
      status: 'ACTIVE',
    });
  }

  async getStudentRoom(studentId: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const allocations = await this.hostelAllocationRepo.findMany({
      studentId,
      hostelIds: ctx.hostelIds,
      status: 'ACTIVE',
    });
    if (allocations.length === 0)
      throw new NotFoundException('Room allocation not found');
    return allocations[0];
  }

  /** Guardian contact list for the Student Profile screen -- 404s the same way
   * getStudentRoom does if the student isn't actually in one of the Warden's own
   * hostels, so guardian info for a student outside their scope is never
   * revealed (checked via the same allocation lookup, not a second query). */
  async getStudentGuardians(studentId: string, personId: string) {
    await this.getStudentRoom(studentId, personId);
    return this.studentGuardianRepo.findActiveGuardians(studentId);
  }
}
