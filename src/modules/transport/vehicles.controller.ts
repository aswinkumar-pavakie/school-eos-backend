import {
  Body,
  Controller,
  Delete,
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
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleDocumentDto } from './dto/create-vehicle-document.dto';
import { UpdateVehicleDocumentDto } from './dto/update-vehicle-document.dto';
import { CreateVehicleMaintenanceDto } from './dto/create-vehicle-maintenance.dto';
import { UpdateVehicleMaintenanceDto } from './dto/update-vehicle-maintenance.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 11);
// every write method below keeps its own narrower @Roles('ADMIN') override --
// RolesGuard's Reflector.getAllAndOverride means a method-level @Roles fully
// replaces, never merges with, the class-level one.
//
// VICE_PRINCIPAL (Phase 13 mobile Transport module) is granted access on
// list/get ONLY, via their own method-level overrides below -- deliberately
// NOT a class-level change. listDocuments/listMaintenance stay
// ADMIN+PRINCIPAL only: vehicle maintenance is literally "Repair &
// Maintenance", a module Phase 13's own instructions explicitly exclude
// ("Do NOT start or modify: ... Repair & Maintenance"), and vehicle
// documents were never requested by this phase either.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('vehicles')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async list() {
    return { data: await this.vehiclesService.list() };
  }

  @Get('vehicles/:id')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async get(@Param('id') id: string) {
    return { data: await this.vehiclesService.get(id) };
  }

  @Post('vehicles')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateVehicleDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.vehiclesService.create(dto, actor.personId) };
  }

  @Patch('vehicles/:id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.update(id, dto, actor.personId) };
  }

  @Get('vehicles/:id/documents')
  async listDocuments(@Param('id') id: string) {
    return { data: await this.vehiclesService.listDocuments(id) };
  }

  @Post('vehicles/:id/documents')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createDocument(
    @Param('id') id: string,
    @Body() dto: CreateVehicleDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.createDocument(id, dto, actor.personId) };
  }

  @Patch('vehicle-documents/:documentId')
  @Roles('ADMIN')
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() dto: UpdateVehicleDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.updateDocument(documentId, dto, actor.personId) };
  }

  @Delete('vehicle-documents/:documentId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(
    @Param('documentId') documentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.vehiclesService.deleteDocument(documentId, actor.personId);
    return { data: { deleted: true } };
  }

  @Get('vehicles/:id/maintenance')
  async listMaintenance(@Param('id') id: string) {
    return { data: await this.vehiclesService.listMaintenance(id) };
  }

  @Post('vehicles/:id/maintenance')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createMaintenance(
    @Param('id') id: string,
    @Body() dto: CreateVehicleMaintenanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.createMaintenance(id, dto, actor.personId) };
  }

  @Patch('vehicle-maintenance/:maintenanceId')
  @Roles('ADMIN')
  async updateMaintenance(
    @Param('maintenanceId') maintenanceId: string,
    @Body() dto: UpdateVehicleMaintenanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.updateMaintenance(maintenanceId, dto, actor.personId) };
  }
}
