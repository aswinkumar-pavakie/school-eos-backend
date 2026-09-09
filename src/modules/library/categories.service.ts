import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { isUniqueViolation } from './pg-error.util';
import { LibraryCategoryRepository } from './repositories/library-category.repository';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepo: LibraryCategoryRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: CategoryQueryDto) {
    return this.categoryRepo.findMany({ status: query.status });
  }

  async create(dto: CreateCategoryDto, actorPersonId: string) {
    try {
      const created = await this.categoryRepo.create(dto.name);
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_CATEGORY_CREATED',
        objectType: 'library_category',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A category with this name already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto, actorPersonId: string) {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) throw new NotFoundException('Category not found');
    try {
      const updated = (await this.categoryRepo.update(id, dto))!;
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_CATEGORY_UPDATED',
        objectType: 'library_category',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A category with this name already exists.');
      throw err;
    }
  }
}
