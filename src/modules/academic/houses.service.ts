import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HouseRepository } from './repositories/house.repository';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class HousesService {
  constructor(
    private readonly houseRepo: HouseRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.houseRepo.findMany();
  }

  async get(id: string) {
    const house = await this.houseRepo.findById(id);
    if (!house) throw new NotFoundException('House not found');
    return house;
  }

  async create(dto: CreateHouseDto, actorPersonId: string) {
    try {
      const created = await this.houseRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'HOUSE_CREATED',
        objectType: 'house',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A house with this name already exists.');
      if (isForeignKeyViolation(err)) throw new ConflictException('captainStudentId does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateHouseDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.houseRepo.update(id, dto);
      if (!updated) throw new NotFoundException('House not found');
      await this.auditService.record({
        actorPersonId,
        action: 'HOUSE_UPDATED',
        objectType: 'house',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A house with this name already exists.');
      if (isForeignKeyViolation(err)) throw new ConflictException('captainStudentId does not exist.');
      throw err;
    }
  }
}
