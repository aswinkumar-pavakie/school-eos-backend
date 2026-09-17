import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { DriverRepository } from './repositories/driver.repository';
import { DriverDocumentRepository } from './repositories/driver-document.repository';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { UpdateDriverDocumentDto } from './dto/update-driver-document.dto';
import { RequestDriverDeactivateDto } from './dto/request-driver-deactivate.dto';
import { isCheckViolation, isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class DriversService {
  constructor(
    private readonly driverRepo: DriverRepository,
    private readonly driverDocumentRepo: DriverDocumentRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly approvalsService: ApprovalsService,
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
      if (isForeignKeyViolation(err))
        throw new ConflictException('personId does not exist.');
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
      if (isForeignKeyViolation(err))
        throw new ConflictException('personId does not exist.');
      throw err;
    }
  }

  // Mirrors VehiclesService's own document methods exactly -- same shape,
  // same validation, same audit pattern.

  async listDocuments(driverId: string) {
    await this.get(driverId);
    return this.driverDocumentRepo.findByDriverId(driverId);
  }

  async createDocument(
    driverId: string,
    dto: CreateDriverDocumentDto,
    actorPersonId: string,
  ) {
    await this.get(driverId);
    if (dto.validFrom && dto.validTo < dto.validFrom) {
      throw new BadRequestException('validTo must be on or after validFrom.');
    }
    try {
      const created = await this.driverDocumentRepo.create(driverId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'DRIVER_DOCUMENT_CREATED',
        objectType: 'driver_document',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isCheckViolation(err))
        throw new BadRequestException('validTo must be on or after validFrom.');
      throw err;
    }
  }

  async updateDocument(
    documentId: string,
    dto: UpdateDriverDocumentDto,
    actorPersonId: string,
  ) {
    const existing = await this.driverDocumentRepo.findById(documentId);
    if (!existing) throw new NotFoundException('Driver document not found');

    const nextValidFrom = dto.validFrom ?? existing.validFrom ?? undefined;
    const nextValidTo = dto.validTo ?? existing.validTo;
    if (nextValidFrom && nextValidTo < nextValidFrom) {
      throw new BadRequestException('validTo must be on or after validFrom.');
    }

    try {
      const updated = await this.driverDocumentRepo.update(documentId, dto);
      if (!updated) throw new NotFoundException('Driver document not found');
      await this.auditService.record({
        actorPersonId,
        action: 'DRIVER_DOCUMENT_UPDATED',
        objectType: 'driver_document',
        objectId: documentId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isCheckViolation(err))
        throw new BadRequestException('validTo must be on or after validFrom.');
      throw err;
    }
  }

  async deleteDocument(documentId: string, actorPersonId: string) {
    const deleted = await this.driverDocumentRepo.delete(documentId);
    if (!deleted) throw new NotFoundException('Driver document not found');
    await this.auditService.record({
      actorPersonId,
      action: 'DRIVER_DOCUMENT_DELETED',
      objectType: 'driver_document',
      objectId: documentId,
      outcome: 'SUCCESS',
    });
  }

  /** No real hard-delete exists for a driver -- this is Transport Manager's
   * own request to deactivate one (status -> INACTIVE), routed through the
   * generic approvals engine to a real ADMIN decision, mirroring
   * VehiclesService.requestDeactivate exactly. The actual state change only
   * happens in transport-approval-handlers.service.ts's own 'driver'
   * onApproved -- never here. */
  async requestDeactivate(
    id: string,
    dto: RequestDriverDeactivateDto,
    actorPersonId: string,
  ) {
    const driver = await this.get(id);
    return this.unitOfWork.run(async (client) => {
      const { rows: pending } = await client.query(
        `SELECT id FROM approval_request WHERE subject_object_type = 'driver' AND subject_object_id = $1 AND state IN ('PENDING', 'RETROSPECTIVE_PENDING') LIMIT 1`,
        [id],
      );
      if (pending[0]) {
        throw new ConflictException(
          'A deactivation request for this driver is already pending Admin review.',
        );
      }
      const request = await this.approvalsService.createRequest(
        {
          requestType: 'DRIVER_DEACTIVATE',
          subjectObjectType: 'driver',
          subjectObjectId: id,
          requestedBy: actorPersonId,
          payload: { fullName: driver.fullName, reason: dto.reason },
        },
        client,
      );
      await this.auditService.record(
        {
          actorPersonId,
          action: 'DRIVER_DEACTIVATE_REQUESTED',
          objectType: 'driver',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { approvalRequestId: request.id, reason: dto.reason },
        },
        client,
      );
      return request;
    });
  }
}
