import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto';
import { InventoryCategoriesService } from './inventory-categories.service';

// Configurable inventory categories (Sports equipment, Lab equipment, IT
// equipment, Furniture, School supplies, etc.) -- rows in a table, not a
// hard-coded enum, so Admin can add new ones without a code change.
@Roles('ADMIN')
@Controller('inventory-categories')
export class InventoryCategoriesController {
  constructor(private readonly categoriesService: InventoryCategoriesService) {}

  @Get()
  async list() {
    return { data: await this.categoriesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.categoriesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInventoryCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.categoriesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.categoriesService.update(id, dto, actor.personId),
    };
  }
}
