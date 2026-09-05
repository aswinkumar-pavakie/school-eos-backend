import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { MediumRepository } from './repositories/medium.repository';
import { CreateMediumDto } from './dto/create-medium.dto';
import { UpdateMediumDto } from './dto/update-medium.dto';
import { isUniqueViolation } from './pg-error.util';

@Injectable()
export class MediumsService {
  constructor(
    private readonly mediumRepo: MediumRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.mediumRepo.findMany();
  }

  async get(id: string) {
    const medium = await this.mediumRepo.findById(id);
    if (!medium) throw new NotFoundException('Medium not found');
    return medium;
  }

  async create(dto: CreateMediumDto, actorPersonId: string) {
    try {
      const created = await this.mediumRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'MEDIUM_CREATED',
        objectType: 'medium',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A medium with this name or code already exists.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateMediumDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.mediumRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Medium not found');
      await this.auditService.record({
        actorPersonId,
        action: 'MEDIUM_UPDATED',
        objectType: 'medium',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A medium with this name or code already exists.');
      }
      throw err;
    }
  }
}
