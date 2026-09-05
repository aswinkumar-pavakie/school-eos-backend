import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { AddStockDto } from './dto/add-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { InventoryItemNoteDto } from './dto/inventory-item-note.dto';
import { InventoryItemQueryDto } from './dto/inventory-item-query.dto';
import { IssueInventoryItemDto } from './dto/issue-inventory-item.dto';
import { TransferInventoryItemDto } from './dto/transfer-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { InventoryItemRepository } from './repositories/inventory-item.repository';

@Injectable()
export class InventoryItemsService {
  constructor(
    private readonly itemRepo: InventoryItemRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async list(query: InventoryItemQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.itemRepo.findMany({
      search: query.search,
      categoryId: query.categoryId,
      status: query.status,
      location: query.location,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  overview() {
    return this.itemRepo.findOverviewCounts();
  }

  async get(id: string) {
    const item = await this.itemRepo.findById(id);
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async create(dto: CreateInventoryItemDto, actorPersonId: string) {
    try {
      const created = await this.itemRepo.create({ ...dto, createdBy: actorPersonId });
      await this.auditService.record({
        actorPersonId,
        action: 'INVENTORY_ITEM_CREATED',
        objectType: 'inventory_item',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('An item with this asset code already exists.');
      if (isForeignKeyViolation(err)) throw new NotFoundException('categoryId does not refer to an existing category.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateInventoryItemDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.itemRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Inventory item not found');
      await this.auditService.record({
        actorPersonId,
        action: 'INVENTORY_ITEM_UPDATED',
        objectType: 'inventory_item',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('An item with this asset code already exists.');
      if (isForeignKeyViolation(err)) throw new NotFoundException('categoryId does not refer to an existing category.');
      throw err;
    }
  }

  // Every stock/status action below locks the item row first (FOR UPDATE) so two
  // concurrent actions on the same item (e.g. issue + mark-lost racing) can't both
  // read a stale status and both "succeed" against a state that no longer holds.

  async addStock(id: string, dto: AddStockDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.itemRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Inventory item not found');
      if (locked.status === 'RETIRED') {
        throw new ConflictException('This item is retired -- it can no longer be restocked.');
      }
      const updated = (await this.itemRepo.addStock(id, dto.quantity, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'INVENTORY_ITEM_STOCK_ADDED',
          objectType: 'inventory_item',
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

  async adjustStock(id: string, dto: AdjustStockDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.itemRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Inventory item not found');
      const updated = (await this.itemRepo.setQuantity(id, dto.quantity, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'INVENTORY_ITEM_STOCK_ADJUSTED',
          objectType: 'inventory_item',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: { ...updated, reason: dto.reason },
        },
        client,
      );
      return updated;
    });
  }

  async issue(id: string, dto: IssueInventoryItemDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.itemRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Inventory item not found');
      if (locked.status !== 'AVAILABLE') {
        throw new ConflictException(
          `This item is currently ${locked.status.toLowerCase()}, not available -- it can't be issued.`,
        );
      }
      try {
        const updated = (await this.itemRepo.issue(
          id,
          dto.assignedToPersonId,
          dto.assignedOn ?? new Date().toISOString().slice(0, 10),
          client,
        ))!;
        await this.auditService.record(
          {
            actorPersonId,
            action: 'INVENTORY_ITEM_ISSUED',
            objectType: 'inventory_item',
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

  async returnItem(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.itemRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Inventory item not found');
      if (locked.status !== 'ASSIGNED') {
        throw new ConflictException('This item is not currently assigned to anyone.');
      }
      const updated = (await this.itemRepo.returnItem(id, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'INVENTORY_ITEM_RETURNED',
          objectType: 'inventory_item',
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

  async transfer(id: string, dto: TransferInventoryItemDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.itemRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Inventory item not found');
      const updated = (await this.itemRepo.transfer(id, dto.location, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'INVENTORY_ITEM_TRANSFERRED',
          objectType: 'inventory_item',
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

  private async markStatus(id: string, status: string, action: string, dto: InventoryItemNoteDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.itemRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Inventory item not found');
      if (locked.status === 'RETIRED') {
        throw new ConflictException('This item is retired -- its status can no longer change.');
      }
      const updated = (await this.itemRepo.setStatus(id, status, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action,
          objectType: 'inventory_item',
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

  markDamaged(id: string, dto: InventoryItemNoteDto, actorPersonId: string) {
    return this.markStatus(id, 'DAMAGED', 'INVENTORY_ITEM_MARKED_DAMAGED', dto, actorPersonId);
  }

  markLost(id: string, dto: InventoryItemNoteDto, actorPersonId: string) {
    return this.markStatus(id, 'LOST', 'INVENTORY_ITEM_MARKED_LOST', dto, actorPersonId);
  }

  retire(id: string, dto: InventoryItemNoteDto, actorPersonId: string) {
    return this.markStatus(id, 'RETIRED', 'INVENTORY_ITEM_RETIRED', dto, actorPersonId);
  }
}
