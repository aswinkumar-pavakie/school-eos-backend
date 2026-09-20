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
import { HousesService } from './houses.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';

@Roles('ADMIN')
@Controller('houses')
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  // SPORTS_ADMIN broadened onto these two reads only -- the Sports Admin
  // console's own Houses & inter-house screen needs the real, full list of
  // houses (not just ones with fixture results, which is all
  // /sports/houses/performance can offer) to populate its "+ Record points"
  // house picker. Writes stay ADMIN-only.
  @Get()
  @Roles('ADMIN', 'SPORTS_ADMIN')
  async list() {
    return { data: await this.housesService.list() };
  }

  @Get(':id')
  @Roles('ADMIN', 'SPORTS_ADMIN')
  async get(@Param('id') id: string) {
    return { data: await this.housesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateHouseDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
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
