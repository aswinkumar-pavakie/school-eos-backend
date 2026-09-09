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

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- these reads are reachable by
  // TRANSPORT_MANAGER too, on top of the class-level PRINCIPAL/VICE_PRINCIPAL
  // oversight grant (a method-level override fully replaces the class
  // default rather than adding to it, so both must be listed explicitly
  // here or PRINCIPAL/VICE_PRINCIPAL would silently lose read access);
  // create/update stay ADMIN-only exactly as before.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get()
  async list() {
    return { data: await this.driversService.list() };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.driversService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateDriverDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
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
