import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@Roles('ADMIN')
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  async list() {
    return { data: await this.driversService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.driversService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDriverDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.driversService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.driversService.update(id, dto, actor.personId) };
  }
}
