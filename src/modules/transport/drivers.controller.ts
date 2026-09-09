import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 11),
// and to VICE_PRINCIPAL (Phase 13 mobile Transport module -- same oversight
// need) -- every write method below keeps its own narrower @Roles('ADMIN')
// override. Drivers remain plain transport master records, never application
// users -- no driver login/role is introduced here.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
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
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDriverDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.driversService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.driversService.update(id, dto, actor.personId) };
  }
}
