import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateSportCategoryDto } from './dto/create-sport-category.dto';
import { CreateSportDto } from './dto/create-sport.dto';
import { UpdateSportCategoryDto } from './dto/update-sport-category.dto';
import { UpdateSportDto } from './dto/update-sport.dto';
import { SportsService } from './sports.service';

@Roles('ADMIN')
@Controller()
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  @Get('sports')
  async list() {
    return { data: await this.sportsService.list() };
  }

  @Get('sports/:id')
  async get(@Param('id') id: string) {
    return { data: await this.sportsService.get(id) };
  }

  @Post('sports')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSportDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.sportsService.create(dto, actor.personId) };
  }

  @Patch('sports/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSportDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sportsService.update(id, dto, actor.personId) };
  }

  @Get('sports/:id/categories')
  async listCategories(@Param('id') id: string) {
    return { data: await this.sportsService.listCategories(id) };
  }

  @Post('sports/:id/categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @Param('id') id: string,
    @Body() dto: CreateSportCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sportsService.createCategory(id, dto, actor.personId) };
  }

  @Patch('sport-categories/:categoryId')
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateSportCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sportsService.updateCategory(categoryId, dto, actor.personId) };
  }
}
