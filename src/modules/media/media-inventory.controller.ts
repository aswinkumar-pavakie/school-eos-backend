// Thin, scoped wrapper over the existing generic Inventory module (see
// database/migrations/0006_media_room.sql's "Media & AV Equipment" category seed)
// -- reuses InventoryItemsService/InventoryCategoryRepository as-is rather than a
// parallel camera/lens register, but a Media Room login only ever sees/creates
// items in its own category, never every department's asset register the way
// Admin's own /inventory-items does.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateInventoryItemDto } from '../inventory/dto/create-inventory-item.dto';
import { InventoryItemNoteDto } from '../inventory/dto/inventory-item-note.dto';
import { InventoryItemQueryDto } from '../inventory/dto/inventory-item-query.dto';
import { IssueInventoryItemDto } from '../inventory/dto/issue-inventory-item.dto';
import { UpdateInventoryItemDto } from '../inventory/dto/update-inventory-item.dto';
import { InventoryCategoryRepository } from '../inventory/repositories/inventory-category.repository';
import { InventoryItemsService } from '../inventory/inventory-items.service';

const MEDIA_CATEGORY_NAME = 'Media & AV Equipment';

// PRINCIPAL is read-only oversight here, same as everywhere else -- every
// write method below carries its own narrower @Roles('MEDIA_ROOM', 'ADMIN')
// override (RolesGuard's Reflector.getAllAndOverride means a method-level
// @Roles fully replaces the class-level one).
@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/inventory')
export class MediaInventoryController {
  constructor(
    private readonly itemsService: InventoryItemsService,
    private readonly categoryRepo: InventoryCategoryRepository,
  ) {}

  private async mediaCategoryId(): Promise<string> {
    const categories = await this.categoryRepo.findMany();
    const category = categories.find((c) => c.name === MEDIA_CATEGORY_NAME);
    if (!category) {
      throw new BadRequestException(
        `The "${MEDIA_CATEGORY_NAME}" inventory category is missing -- run database/migrations/0006_media_room.sql first.`,
      );
    }
    return category.id;
  }

  @Get()
  async list(@Query() query: InventoryItemQueryDto) {
    const categoryId = await this.mediaCategoryId();
    return this.itemsService.list({ ...query, categoryId });
  }

  @Get('overview')
  async overview() {
    // Real, Media-scoped counts -- never the shared school-wide overview() (that
    // would leak every other department's totals onto this role's own dashboard).
    const categoryId = await this.mediaCategoryId();
    const query = new InventoryItemQueryDto();
    query.categoryId = categoryId;
    query.limit = 500;
    query.page = 1;
    const { data: items } = await this.itemsService.list(query);
    return {
      data: {
        total: items.length,
        available: items.filter((i) => i.status === 'AVAILABLE').length,
        assigned: items.filter((i) => i.status === 'ASSIGNED').length,
        underRepair: items.filter((i) => i.status === 'DAMAGED').length,
        bookValuePaise: items.reduce(
          (sum, i) => sum + Number(i.acquisitionCostPaise ?? 0),
          0,
        ),
      },
    };
  }

  // A Media Room login must never see or touch another department's asset by
  // guessing/knowing its id -- every :id route below re-checks the item's own
  // categoryId, not just the list filter above.
  private async assertOwnedByMedia(
    id: string,
    categoryId: string,
  ): Promise<void> {
    const item = await this.itemsService.get(id);
    if (item.categoryId !== categoryId)
      throw new NotFoundException('Inventory item not found');
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    return { data: await this.itemsService.get(id) };
  }

  @Post()
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    return {
      data: await this.itemsService.create(
        { ...dto, categoryId },
        actor.personId,
      ),
    };
  }

  @Patch(':id')
  @Roles('MEDIA_ROOM', 'ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    // categoryId is never accepted from the client here -- a Media Room login can
    // edit an item's other fields but can never move it out of its own category.
    const { categoryId: _ignored, ...rest } = dto;
    return { data: await this.itemsService.update(id, rest, actor.personId) };
  }

  @Post(':id/issue')
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async issue(
    @Param('id') id: string,
    @Body() dto: IssueInventoryItemDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    return { data: await this.itemsService.issue(id, dto, actor.personId) };
  }

  @Post(':id/return')
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async returnItem(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    return { data: await this.itemsService.returnItem(id, actor.personId) };
  }

  @Post(':id/mark-damaged')
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async markDamaged(
    @Param('id') id: string,
    @Body() dto: InventoryItemNoteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    return {
      data: await this.itemsService.markDamaged(id, dto, actor.personId),
    };
  }

  @Post(':id/mark-lost')
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async markLost(
    @Param('id') id: string,
    @Body() dto: InventoryItemNoteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    return { data: await this.itemsService.markLost(id, dto, actor.personId) };
  }

  @Post(':id/retire')
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async retire(
    @Param('id') id: string,
    @Body() dto: InventoryItemNoteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const categoryId = await this.mediaCategoryId();
    await this.assertOwnedByMedia(id, categoryId);
    return { data: await this.itemsService.retire(id, dto, actor.personId) };
  }
}
