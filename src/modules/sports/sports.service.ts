import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateSportCategoryDto } from './dto/create-sport-category.dto';
import { CreateSportDto } from './dto/create-sport.dto';
import { UpdateSportCategoryDto } from './dto/update-sport-category.dto';
import { UpdateSportDto } from './dto/update-sport.dto';
import { isUniqueViolation } from './pg-error.util';
import { SportCategoryRepository } from './repositories/sport-category.repository';
import { SportRepository } from './repositories/sport.repository';

@Injectable()
export class SportsService {
  constructor(
    private readonly sportRepo: SportRepository,
    private readonly sportCategoryRepo: SportCategoryRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.sportRepo.findMany();
  }

  async get(id: string) {
    const sport = await this.sportRepo.findById(id);
    if (!sport) throw new NotFoundException('Sport not found');
    return sport;
  }

  async create(dto: CreateSportDto, actorPersonId: string) {
    try {
      const created = await this.sportRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'SPORT_CREATED',
        objectType: 'sport',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A sport with this name already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateSportDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.sportRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Sport not found');
      await this.auditService.record({
        actorPersonId,
        action: 'SPORT_UPDATED',
        objectType: 'sport',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A sport with this name already exists.');
      throw err;
    }
  }

  async listCategories(sportId: string) {
    await this.get(sportId);
    return this.sportCategoryRepo.findBySportId(sportId);
  }

  async createCategory(sportId: string, dto: CreateSportCategoryDto, actorPersonId: string) {
    await this.get(sportId);
    try {
      const created = await this.sportCategoryRepo.create(sportId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'SPORT_CATEGORY_CREATED',
        objectType: 'sport_category',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A category with this name already exists for this sport.');
      }
      throw err;
    }
  }

  async updateCategory(categoryId: string, dto: UpdateSportCategoryDto, actorPersonId: string) {
    const existing = await this.sportCategoryRepo.findById(categoryId);
    if (!existing) throw new NotFoundException('Sport category not found');
    try {
      const updated = await this.sportCategoryRepo.update(categoryId, dto);
      if (!updated) throw new NotFoundException('Sport category not found');
      await this.auditService.record({
        actorPersonId,
        action: 'SPORT_CATEGORY_UPDATED',
        objectType: 'sport_category',
        objectId: categoryId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A category with this name already exists for this sport.');
      }
      throw err;
    }
  }
}
