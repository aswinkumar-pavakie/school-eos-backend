import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GpsDeviceMappingRepository } from './repositories/gps-device-mapping.repository';
import { CreateGpsDeviceMappingDto } from './dto/create-gps-device-mapping.dto';
import { UpdateGpsDeviceMappingDto } from './dto/update-gps-device-mapping.dto';
import { GpsDeviceMappingQueryDto } from './dto/gps-device-mapping-query.dto';
import { isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class GpsDeviceMappingsService {
  constructor(
    private readonly mappingRepo: GpsDeviceMappingRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: GpsDeviceMappingQueryDto) {
    return this.mappingRepo.findMany(query);
  }

  async get(id: string) {
    const mapping = await this.mappingRepo.findById(id);
    if (!mapping) throw new NotFoundException('GPS device mapping not found');
    return mapping;
  }

  async create(dto: CreateGpsDeviceMappingDto, actorPersonId: string) {
    try {
      const created = await this.mappingRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'GPS_DEVICE_MAPPING_CREATED',
        objectType: 'gps_device_mapping',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('deviceId or vehicleId does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateGpsDeviceMappingDto, actorPersonId: string) {
    const existing = await this.get(id);
    const updated = await this.mappingRepo.update(id, dto);
    if (!updated) throw new NotFoundException('GPS device mapping not found');
    await this.auditService.record({
      actorPersonId,
      action: 'GPS_DEVICE_MAPPING_UPDATED',
      objectType: 'gps_device_mapping',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
