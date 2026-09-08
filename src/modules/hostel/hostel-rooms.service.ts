import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateHostelBedDto } from './dto/create-hostel-bed.dto';
import { UpdateHostelBedDto } from './dto/update-hostel-bed.dto';
import { isUniqueViolation } from './pg-error.util';
import { HostelBedRepository } from './repositories/hostel-bed.repository';
import { HostelRoomRepository } from './repositories/hostel-room.repository';

@Injectable()
export class HostelRoomsService {
  constructor(
    private readonly hostelRoomRepo: HostelRoomRepository,
    private readonly hostelBedRepo: HostelBedRepository,
    private readonly auditService: AuditService,
  ) {}

  private async assertRoomExists(roomId: string): Promise<void> {
    const room = await this.hostelRoomRepo.findById(roomId);
    if (!room) throw new NotFoundException('Hostel room not found');
  }

  async listBeds(roomId: string) {
    await this.assertRoomExists(roomId);
    return this.hostelBedRepo.findByRoomId(roomId);
  }

  async createBed(roomId: string, dto: CreateHostelBedDto, actorPersonId: string) {
    await this.assertRoomExists(roomId);
    try {
      const created = await this.hostelBedRepo.create(roomId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_BED_CREATED',
        objectType: 'hostel_bed',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A bed with this number already exists in this room.');
      }
      throw err;
    }
  }

  async updateBed(bedId: string, dto: UpdateHostelBedDto, actorPersonId: string) {
    const existing = await this.hostelBedRepo.findById(bedId);
    if (!existing) throw new NotFoundException('Hostel bed not found');
    try {
      const updated = await this.hostelBedRepo.update(bedId, dto);
      if (!updated) throw new NotFoundException('Hostel bed not found');
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_BED_UPDATED',
        objectType: 'hostel_bed',
        objectId: bedId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A bed with this number already exists in this room.');
      }
      throw err;
    }
  }
}
