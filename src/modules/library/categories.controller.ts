import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('library/categories')
@Roles('LIBRARY', 'ADMIN')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async list(@Query() query: CategoryQueryDto) {
    return { data: await this.categoriesService.list(query) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async create(@Body() dto: CreateCategoryDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.categoriesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('LIBRARY')
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.categoriesService.update(id, dto, actor.personId) };
  }
}
