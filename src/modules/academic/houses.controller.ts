import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { HousesService } from './houses.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';

@Roles('ADMIN')
@Controller('houses')
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  @Get()
  async list() {
    return { data: await this.housesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.housesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateHouseDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.housesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHouseDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.housesService.update(id, dto, actor.personId) };
  }
}
