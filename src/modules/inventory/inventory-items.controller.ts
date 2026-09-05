import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AddStockDto } from './dto/add-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { InventoryItemNoteDto } from './dto/inventory-item-note.dto';
import { InventoryItemQueryDto } from './dto/inventory-item-query.dto';
import { IssueInventoryItemDto } from './dto/issue-inventory-item.dto';
import { TransferInventoryItemDto } from './dto/transfer-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemsService } from './inventory-items.service';

@Roles('ADMIN')
@Controller('inventory-items')
export class InventoryItemsController {
  constructor(private readonly itemsService: InventoryItemsService) {}

  @Get()
  async list(@Query() query: InventoryItemQueryDto) {
    const result = await this.itemsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  // Must stay registered before ':id' -- otherwise "overview" would be swallowed
  // by the :id param route.
  @Get('overview')
  async overview() {
    return { data: await this.itemsService.overview() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.itemsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateInventoryItemDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.itemsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.itemsService.update(id, dto, actor.personId) };
  }

  @Post(':id/add-stock')
  @HttpCode(HttpStatus.OK)
  async addStock(@Param('id') id: string, @Body() dto: AddStockDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.itemsService.addStock(id, dto, actor.personId) };
  }

  @Post(':id/adjust-stock')
  @HttpCode(HttpStatus.OK)
  async adjustStock(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.itemsService.adjustStock(id, dto, actor.personId) };
  }

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  async issue(@Param('id') id: string, @Body() dto: IssueInventoryItemDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.itemsService.issue(id, dto, actor.personId) };
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  async returnItem(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.itemsService.returnItem(id, actor.personId) };
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferInventoryItemDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.itemsService.transfer(id, dto, actor.personId) };
  }

  @Post(':id/mark-damaged')
  @HttpCode(HttpStatus.OK)
  async markDamaged(
    @Param('id') id: string,
    @Body() dto: InventoryItemNoteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.itemsService.markDamaged(id, dto, actor.personId) };
  }

  @Post(':id/mark-lost')
  @HttpCode(HttpStatus.OK)
  async markLost(
    @Param('id') id: string,
    @Body() dto: InventoryItemNoteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.itemsService.markLost(id, dto, actor.personId) };
  }

  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  async retire(@Param('id') id: string, @Body() dto: InventoryItemNoteDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.itemsService.retire(id, dto, actor.personId) };
  }
}
