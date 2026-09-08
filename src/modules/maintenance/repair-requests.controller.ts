import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AssignRepairRequestDto } from './dto/assign-repair-request.dto';
import { CancelRepairRequestDto } from './dto/cancel-repair-request.dto';
import { CompleteRepairRequestDto } from './dto/complete-repair-request.dto';
import { CreateRepairRequestDto } from './dto/create-repair-request.dto';
import { RepairRequestQueryDto } from './dto/repair-request-query.dto';
import { UpdateRepairRequestDto } from './dto/update-repair-request.dto';
import { RepairRequestsService } from './repair-requests.service';

// General school assets/equipment/facilities only -- vehicle repair/maintenance
// stays under Transport -> Vehicles (vehicle_maintenance), never duplicated here.
// Class-level role broadened to PRINCIPAL, read-only -- minimal, targeted
// extension so Principal Inventory's item-detail page can show the real repair
// requests raised against that item (see Phase 13's Inventory -> Maintenance
// integration requirement) without duplicating this module or building the
// full Principal Maintenance module yet. Every write method below keeps its
// own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('repair-requests')
export class RepairRequestsController {
  constructor(private readonly repairRequestsService: RepairRequestsService) {}

  @Get()
  async list(@Query() query: RepairRequestQueryDto) {
    const result = await this.repairRequestsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  // Must stay registered before ':id' -- otherwise "overview" would be swallowed
  // by the :id param route.
  @Get('overview')
  async overview() {
    return { data: await this.repairRequestsService.overview() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.repairRequestsService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRepairRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.repairRequestsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRepairRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.repairRequestsService.update(id, dto, actor.personId) };
  }

  @Post(':id/assign')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignRepairRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.repairRequestsService.assign(id, dto, actor.personId) };
  }

  @Post(':id/start')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async start(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.repairRequestsService.start(id, actor.personId) };
  }

  @Post(':id/complete')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id') id: string,
    @Body() dto: CompleteRepairRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.repairRequestsService.complete(id, dto, actor.personId) };
  }

  @Post(':id/cancel')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelRepairRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.repairRequestsService.cancel(id, dto, actor.personId) };
  }
}
