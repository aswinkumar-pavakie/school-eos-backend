import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { InventoryItemRepository } from '../inventory/repositories/inventory-item.repository';
import { AssignRepairRequestDto } from './dto/assign-repair-request.dto';
import { CancelRepairRequestDto } from './dto/cancel-repair-request.dto';
import { CompleteRepairRequestDto } from './dto/complete-repair-request.dto';
import { CreateRepairRequestDto } from './dto/create-repair-request.dto';
import { RepairRequestQueryDto } from './dto/repair-request-query.dto';
import { UpdateRepairRequestDto } from './dto/update-repair-request.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { RepairRequestRepository } from './repositories/repair-request.repository';

const OPEN_STATUSES = ['REQUESTED', 'ASSIGNED', 'IN_PROGRESS'];

@Injectable()
export class RepairRequestsService {
  constructor(
    private readonly repairRequestRepo: RepairRequestRepository,
    private readonly inventoryItemRepo: InventoryItemRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async list(query: RepairRequestQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.repairRequestRepo.findMany({
      search: query.search,
      status: query.status,
      priority: query.priority,
      issueType: query.issueType,
      inventoryItemId: query.inventoryItemId,
      location: query.location,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  overview() {
    return this.repairRequestRepo.findOverviewCounts();
  }

  async get(id: string) {
    const request = await this.repairRequestRepo.findById(id);
    if (!request) throw new NotFoundException('Repair request not found');
    return request;
  }

  async create(dto: CreateRepairRequestDto, actorPersonId: string) {
    try {
      const created = await this.repairRequestRepo.create({ ...dto, requestedBy: actorPersonId });
      await this.auditService.record({
        actorPersonId,
        action: 'REPAIR_REQUEST_CREATED',
        objectType: 'repair_request',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new NotFoundException('inventoryItemId does not refer to an existing item.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateRepairRequestDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.repairRequestRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Repair request not found');
      await this.auditService.record({
        actorPersonId,
        action: 'REPAIR_REQUEST_UPDATED',
        objectType: 'repair_request',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new NotFoundException('inventoryItemId does not refer to an existing item.');
      throw err;
    }
  }

  /** Sets/changes who is doing the work. Only advances REQUESTED -> ASSIGNED
   * (a still-forward move); re-assigning an IN_PROGRESS request just swaps the
   * assignee without regressing its status. */
  async assign(id: string, dto: AssignRepairRequestDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.repairRequestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Repair request not found');
      if (!OPEN_STATUSES.includes(locked.status)) {
        throw new ConflictException(`This request is ${locked.status.toLowerCase()} -- it can't be (re)assigned.`);
      }
      const nextStatus = locked.status === 'REQUESTED' ? 'ASSIGNED' : locked.status;
      try {
        const updated = (await this.repairRequestRepo.assign(
          id,
          dto.assignedToPersonId,
          dto.assignedOn ?? new Date().toISOString().slice(0, 10),
          nextStatus,
          client,
        ))!;
        await this.auditService.record(
          {
            actorPersonId,
            action: 'REPAIR_REQUEST_ASSIGNED',
            objectType: 'repair_request',
            objectId: id,
            outcome: 'SUCCESS',
            beforeData: locked,
            afterData: updated,
          },
          client,
        );
        return updated;
      } catch (err) {
        if (isForeignKeyViolation(err)) throw new NotFoundException('assignedToPersonId does not refer to an existing person.');
        throw err;
      }
    });
  }

  async start(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.repairRequestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Repair request not found');
      if (locked.status !== 'ASSIGNED') {
        throw new ConflictException('Only an assigned request can be moved to in progress.');
      }
      const updated = (await this.repairRequestRepo.setStatus(id, 'IN_PROGRESS', client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'REPAIR_REQUEST_STARTED',
          objectType: 'repair_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  /** Completing a request linked to an item that's currently DAMAGED restores
   * that item to AVAILABLE, in the same transaction -- the one explicit
   * Inventory <-> Repair integration point in the spec. The item's own audit
   * trail gets a matching entry (correlationId = this repair request), so its
   * history stays linked without a second, disconnected history mechanism. */
  async complete(id: string, dto: CompleteRepairRequestDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.repairRequestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Repair request not found');
      if (!OPEN_STATUSES.includes(locked.status)) {
        throw new ConflictException(`This request is already ${locked.status.toLowerCase()}.`);
      }
      const completedOn = dto.completedOn ?? new Date().toISOString().slice(0, 10);
      const updated = (await this.repairRequestRepo.complete(
        id,
        {
          completedOn,
          repairAction: dto.repairAction,
          completionNotes: dto.completionNotes,
          costPaise: dto.costPaise,
        },
        client,
      ))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'REPAIR_REQUEST_COMPLETED',
          objectType: 'repair_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: updated,
        },
        client,
      );

      if (locked.inventoryItemId) {
        const item = await this.inventoryItemRepo.findByIdForUpdate(locked.inventoryItemId, client);
        if (item && item.status === 'DAMAGED') {
          const restoredItem = (await this.inventoryItemRepo.restoreToAvailable(item.id, client))!;
          await this.auditService.record(
            {
              actorPersonId,
              action: 'INVENTORY_ITEM_RESTORED_AFTER_REPAIR',
              objectType: 'inventory_item',
              objectId: item.id,
              outcome: 'SUCCESS',
              correlationId: id,
              beforeData: item,
              afterData: restoredItem,
            },
            client,
          );
        }
      }

      return updated;
    });
  }

  async cancel(id: string, dto: CancelRepairRequestDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.repairRequestRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Repair request not found');
      if (!OPEN_STATUSES.includes(locked.status)) {
        throw new ConflictException(`This request is already ${locked.status.toLowerCase()}.`);
      }
      const updated = (await this.repairRequestRepo.setStatus(id, 'CANCELLED', client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'REPAIR_REQUEST_CANCELLED',
          objectType: 'repair_request',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: { ...updated, notes: dto.notes ?? null },
        },
        client,
      );
      return updated;
    });
  }
}
