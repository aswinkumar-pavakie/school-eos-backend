import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateHostelRoomDto } from './dto/create-hostel-room.dto';
import { UpdateHostelRoomDto } from './dto/update-hostel-room.dto';
import { isUniqueViolation } from './pg-error.util';
import { HostelFloorRepository } from './repositories/hostel-floor.repository';
import { HostelRoomRepository } from './repositories/hostel-room.repository';

@Injectable()
export class HostelFloorsService {
  constructor(
    private readonly hostelFloorRepo: HostelFloorRepository,
    private readonly hostelRoomRepo: HostelRoomRepository,
    private readonly auditService: AuditService,
  ) {}

  private async assertFloorExists(floorId: string): Promise<void> {
    const floor = await this.hostelFloorRepo.findById(floorId);
    if (!floor) throw new NotFoundException('Hostel floor not found');
  }

  async listRooms(floorId: string) {
    await this.assertFloorExists(floorId);
    return this.hostelRoomRepo.findByFloorId(floorId);
  }

  async createRoom(
    floorId: string,
    dto: CreateHostelRoomDto,
    actorPersonId: string,
  ) {
    await this.assertFloorExists(floorId);
    try {
      const created = await this.hostelRoomRepo.create(floorId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_ROOM_CREATED',
        objectType: 'hostel_room',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A room with this number already exists on this floor.',
        );
      }
      throw err;
    }
  }

  async updateRoom(
    roomId: string,
    dto: UpdateHostelRoomDto,
    actorPersonId: string,
  ) {
    const existing = await this.hostelRoomRepo.findById(roomId);
    if (!existing) throw new NotFoundException('Hostel room not found');
    try {
      const updated = await this.hostelRoomRepo.update(roomId, dto);
      if (!updated) throw new NotFoundException('Hostel room not found');
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_ROOM_UPDATED',
        objectType: 'hostel_room',
        objectId: roomId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A room with this number already exists on this floor.',
        );
      }
      throw err;
    }
  }
}
