import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto';
import { isUniqueViolation } from './pg-error.util';
import { InventoryCategoryRepository } from './repositories/inventory-category.repository';

@Injectable()
export class InventoryCategoriesService {
  constructor(
    private readonly categoryRepo: InventoryCategoryRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.categoryRepo.findMany();
  }

  async get(id: string) {
    const category = await this.categoryRepo.findById(id);
    if (!category) throw new NotFoundException('Inventory category not found');
    return category;
  }

  async create(dto: CreateInventoryCategoryDto, actorPersonId: string) {
    try {
      const created = await this.categoryRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'INVENTORY_CATEGORY_CREATED',
        objectType: 'inventory_category',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A category with this name already exists.',
        );
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateInventoryCategoryDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(id);
    try {
      const updated = await this.categoryRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Inventory category not found');
      await this.auditService.record({
        actorPersonId,
        action: 'INVENTORY_CATEGORY_UPDATED',
        objectType: 'inventory_category',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A category with this name already exists.',
        );
      throw err;
    }
  }
}
