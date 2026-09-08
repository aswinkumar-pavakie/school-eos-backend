import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleDocumentRepository } from './repositories/vehicle-document.repository';
import { VehicleMaintenanceRepository } from './repositories/vehicle-maintenance.repository';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleDocumentDto } from './dto/create-vehicle-document.dto';
import { UpdateVehicleDocumentDto } from './dto/update-vehicle-document.dto';
import { CreateVehicleMaintenanceDto } from './dto/create-vehicle-maintenance.dto';
import { UpdateVehicleMaintenanceDto } from './dto/update-vehicle-maintenance.dto';
import { isCheckViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly vehicleRepo: VehicleRepository,
    private readonly vehicleDocumentRepo: VehicleDocumentRepository,
    private readonly vehicleMaintenanceRepo: VehicleMaintenanceRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.vehicleRepo.findMany();
  }

  async get(id: string) {
    const vehicle = await this.vehicleRepo.findById(id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async create(dto: CreateVehicleDto, actorPersonId: string) {
    try {
      const created = await this.vehicleRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'VEHICLE_CREATED',
        objectType: 'vehicle',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A vehicle with this registration number already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateVehicleDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.vehicleRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Vehicle not found');
      await this.auditService.record({
        actorPersonId,
        action: 'VEHICLE_UPDATED',
        objectType: 'vehicle',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A vehicle with this registration number already exists.');
      throw err;
    }
  }

  async listDocuments(vehicleId: string) {
    await this.get(vehicleId);
    return this.vehicleDocumentRepo.findByVehicleId(vehicleId);
  }

  async createDocument(vehicleId: string, dto: CreateVehicleDocumentDto, actorPersonId: string) {
    await this.get(vehicleId);
    if (dto.validFrom && dto.validTo < dto.validFrom) {
      throw new BadRequestException('validTo must be on or after validFrom.');
    }
    try {
      const created = await this.vehicleDocumentRepo.create(vehicleId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'VEHICLE_DOCUMENT_CREATED',
        objectType: 'vehicle_document',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isCheckViolation(err)) throw new BadRequestException('validTo must be on or after validFrom.');
      throw err;
    }
  }

  async updateDocument(documentId: string, dto: UpdateVehicleDocumentDto, actorPersonId: string) {
    const existing = await this.vehicleDocumentRepo.findById(documentId);
    if (!existing) throw new NotFoundException('Vehicle document not found');

    const nextValidFrom = dto.validFrom ?? existing.validFrom ?? undefined;
    const nextValidTo = dto.validTo ?? existing.validTo;
    if (nextValidFrom && nextValidTo < nextValidFrom) {
      throw new BadRequestException('validTo must be on or after validFrom.');
    }

    try {
      const updated = await this.vehicleDocumentRepo.update(documentId, dto);
      if (!updated) throw new NotFoundException('Vehicle document not found');
      await this.auditService.record({
        actorPersonId,
        action: 'VEHICLE_DOCUMENT_UPDATED',
        objectType: 'vehicle_document',
        objectId: documentId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isCheckViolation(err)) throw new BadRequestException('validTo must be on or after validFrom.');
      throw err;
    }
  }

  async deleteDocument(documentId: string, actorPersonId: string) {
    const deleted = await this.vehicleDocumentRepo.delete(documentId);
    if (!deleted) throw new NotFoundException('Vehicle document not found');
    await this.auditService.record({
      actorPersonId,
      action: 'VEHICLE_DOCUMENT_DELETED',
      objectType: 'vehicle_document',
      objectId: documentId,
      outcome: 'SUCCESS',
    });
  }

  async listMaintenance(vehicleId: string) {
    await this.get(vehicleId);
    return this.vehicleMaintenanceRepo.findByVehicleId(vehicleId);
  }

  async createMaintenance(vehicleId: string, dto: CreateVehicleMaintenanceDto, actorPersonId: string) {
    await this.get(vehicleId);
    const created = await this.vehicleMaintenanceRepo.create(vehicleId, dto);
    await this.auditService.record({
      actorPersonId,
      action: 'VEHICLE_MAINTENANCE_CREATED',
      objectType: 'vehicle_maintenance',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async updateMaintenance(maintenanceId: string, dto: UpdateVehicleMaintenanceDto, actorPersonId: string) {
    const updated = await this.vehicleMaintenanceRepo.update(maintenanceId, dto);
    if (!updated) throw new NotFoundException('Vehicle maintenance record not found');
    await this.auditService.record({
      actorPersonId,
      action: 'VEHICLE_MAINTENANCE_UPDATED',
      objectType: 'vehicle_maintenance',
      objectId: maintenanceId,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }
}
