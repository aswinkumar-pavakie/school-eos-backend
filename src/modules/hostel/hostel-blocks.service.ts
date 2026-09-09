import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateHostelFloorDto } from './dto/create-hostel-floor.dto';
import { UpdateHostelFloorDto } from './dto/update-hostel-floor.dto';
import { isUniqueViolation } from './pg-error.util';
import { HostelBlockRepository } from './repositories/hostel-block.repository';
import { HostelFloorRepository } from './repositories/hostel-floor.repository';

@Injectable()
export class HostelBlocksService {
  constructor(
    private readonly hostelBlockRepo: HostelBlockRepository,
    private readonly hostelFloorRepo: HostelFloorRepository,
    private readonly auditService: AuditService,
  ) {}

  private async assertBlockExists(blockId: string): Promise<void> {
    const block = await this.hostelBlockRepo.findById(blockId);
    if (!block) throw new NotFoundException('Hostel block not found');
  }

  async listFloors(blockId: string) {
    await this.assertBlockExists(blockId);
    return this.hostelFloorRepo.findByBlockId(blockId);
  }

  async createFloor(
    blockId: string,
    dto: CreateHostelFloorDto,
    actorPersonId: string,
  ) {
    await this.assertBlockExists(blockId);
    try {
      const created = await this.hostelFloorRepo.create(blockId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_FLOOR_CREATED',
        objectType: 'hostel_floor',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This floor number already exists in this block.',
        );
      }
      throw err;
    }
  }

  async updateFloor(
    floorId: string,
    dto: UpdateHostelFloorDto,
    actorPersonId: string,
  ) {
    const existing = await this.hostelFloorRepo.findById(floorId);
    if (!existing) throw new NotFoundException('Hostel floor not found');
    try {
      const updated = await this.hostelFloorRepo.update(floorId, dto);
      if (!updated) throw new NotFoundException('Hostel floor not found');
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_FLOOR_UPDATED',
        objectType: 'hostel_floor',
        objectId: floorId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This floor number already exists in this block.',
        );
      }
      throw err;
    }
  }
}
