import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { isCheckViolation, isForeignKeyViolation } from './pg-error.util';
import { EquipmentRepository } from './repositories/equipment.repository';

@Injectable()
export class EquipmentService {
  constructor(
    private readonly equipmentRepo: EquipmentRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.equipmentRepo.findMany();
  }

  async get(id: string) {
    const equipment = await this.equipmentRepo.findById(id);
    if (!equipment) throw new NotFoundException('Equipment not found');
    return equipment;
  }

  async create(dto: CreateEquipmentDto, actorPersonId: string) {
    try {
      const created = await this.equipmentRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'EQUIPMENT_CREATED',
        objectType: 'equipment',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException('quantityAvailable cannot exceed quantityTotal.');
      }
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('sportId does not refer to an existing sport.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateEquipmentDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.equipmentRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Equipment not found');
      await this.auditService.record({
        actorPersonId,
        action: 'EQUIPMENT_UPDATED',
        objectType: 'equipment',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException('quantityAvailable cannot exceed quantityTotal.');
      }
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('sportId does not refer to an existing sport.');
      }
      throw err;
    }
  }
}
