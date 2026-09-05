import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateHostelBlockDto } from './dto/create-hostel-block.dto';
import { CreateHostelDto } from './dto/create-hostel.dto';
import { UpdateHostelBlockDto } from './dto/update-hostel-block.dto';
import { UpdateHostelDto } from './dto/update-hostel.dto';
import { isUniqueViolation } from './pg-error.util';
import { HostelBlockRepository } from './repositories/hostel-block.repository';
import { HostelRepository } from './repositories/hostel.repository';

@Injectable()
export class HostelsService {
  constructor(
    private readonly hostelRepo: HostelRepository,
    private readonly hostelBlockRepo: HostelBlockRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.hostelRepo.findMany();
  }

  async get(id: string) {
    const hostel = await this.hostelRepo.findById(id);
    if (!hostel) throw new NotFoundException('Hostel not found');
    return hostel;
  }

  async create(dto: CreateHostelDto, actorPersonId: string) {
    try {
      const created = await this.hostelRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_CREATED',
        objectType: 'hostel',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A hostel with this name already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateHostelDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.hostelRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Hostel not found');
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_UPDATED',
        objectType: 'hostel',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A hostel with this name already exists.');
      throw err;
    }
  }

  async listBlocks(hostelId: string) {
    await this.get(hostelId);
    return this.hostelBlockRepo.findByHostelId(hostelId);
  }

  async createBlock(hostelId: string, dto: CreateHostelBlockDto, actorPersonId: string) {
    await this.get(hostelId);
    try {
      const created = await this.hostelBlockRepo.create(hostelId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_BLOCK_CREATED',
        objectType: 'hostel_block',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A block with this name already exists in this hostel.');
      }
      throw err;
    }
  }

  async updateBlock(blockId: string, dto: UpdateHostelBlockDto, actorPersonId: string) {
    const existing = await this.hostelBlockRepo.findById(blockId);
    if (!existing) throw new NotFoundException('Hostel block not found');
    try {
      const updated = await this.hostelBlockRepo.update(blockId, dto);
      if (!updated) throw new NotFoundException('Hostel block not found');
      await this.auditService.record({
        actorPersonId,
        action: 'HOSTEL_BLOCK_UPDATED',
        objectType: 'hostel_block',
        objectId: blockId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A block with this name already exists in this hostel.');
      }
      throw err;
    }
  }
}
