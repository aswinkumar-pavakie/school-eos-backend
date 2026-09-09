import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GpsDeviceRepository } from './repositories/gps-device.repository';
import { CreateGpsDeviceDto } from './dto/create-gps-device.dto';
import { UpdateGpsDeviceDto } from './dto/update-gps-device.dto';
import { isUniqueViolation } from './pg-error.util';

@Injectable()
export class GpsDevicesService {
  constructor(
    private readonly gpsDeviceRepo: GpsDeviceRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.gpsDeviceRepo.findMany();
  }

  async get(id: string) {
    const device = await this.gpsDeviceRepo.findById(id);
    if (!device) throw new NotFoundException('GPS device not found');
    return device;
  }

  async create(dto: CreateGpsDeviceDto, actorPersonId: string) {
    try {
      const created = await this.gpsDeviceRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'GPS_DEVICE_CREATED',
        objectType: 'gps_device',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A GPS device with this device_uid already exists.',
        );
      throw err;
    }
  }

  async update(id: string, dto: UpdateGpsDeviceDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.gpsDeviceRepo.update(id, dto);
      if (!updated) throw new NotFoundException('GPS device not found');
      await this.auditService.record({
        actorPersonId,
        action: 'GPS_DEVICE_UPDATED',
        objectType: 'gps_device',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A GPS device with this device_uid already exists.',
        );
      throw err;
    }
  }
}
