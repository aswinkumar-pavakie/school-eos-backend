import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { DriverRepository } from './repositories/driver.repository';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class DriversService {
  constructor(
    private readonly driverRepo: DriverRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.driverRepo.findMany();
  }

  async get(id: string) {
    const driver = await this.driverRepo.findById(id);
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  async create(dto: CreateDriverDto, actorPersonId: string) {
    try {
      const created = await this.driverRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'DRIVER_CREATED',
        objectType: 'driver',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('personId does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateDriverDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.driverRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Driver not found');
      await this.auditService.record({
        actorPersonId,
        action: 'DRIVER_UPDATED',
        objectType: 'driver',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('personId does not exist.');
      throw err;
    }
  }
}
