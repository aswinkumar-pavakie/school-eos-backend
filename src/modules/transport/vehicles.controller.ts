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
  Query,
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
import { CreateFuelLogDto } from './dto/create-fuel-log.dto';
import { UpdateVehicleSpecDto } from './dto/update-vehicle-spec.dto';
import { RequestVehicleDeactivateDto } from './dto/request-vehicle-deactivate.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 11);
// every write method below keeps its own narrower @Roles('ADMIN') override --
// RolesGuard's Reflector.getAllAndOverride means a method-level @Roles fully
// replaces, never merges with, the class-level one.
//
// VICE_PRINCIPAL (Phase 13 mobile Transport module) is granted access on
// list/get ONLY, via their own method-level overrides below -- deliberately
// NOT a class-level change.
//
// Vehicle documents/maintenance: TRANSPORT_MANAGER now has real operational
// access (list + create/update) -- this is the Transport Module task's own
// core principle ("Transport owns operational maintenance of these records";
// Admin retains oversight/authorized intervention). delete stays ADMIN-only
// deliberately -- removing a document record outright is the one more
// administrative action here, not day-to-day upkeep. This is a distinct,
// simpler log (vehicle_maintenance table) from the generic Repair &
// Maintenance module (repair_request table, Inventory/asset workflow) --
// still two separate systems, not merged by this change; see this repo's own
// query.md notes on that open design question.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- so these two reads are reachable by
  // TRANSPORT_MANAGER and PRINCIPAL/VICE_PRINCIPAL (Phase 13 mobile
  // Transport module), while every other route on this controller stays
  // ADMIN-only exactly as before (create/update/documents/maintenance).
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles')
  async list() {
    return { data: await this.vehiclesService.list() };
  }

  // Fixed-path routes registered BEFORE 'vehicles/:id' below -- Nest matches
  // routes in registration order, and ':id' would otherwise greedily swallow
  // 'service-due' or 'fuel-log' as a literal vehicle id.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/service-due')
  async serviceDue() {
    const map = await this.vehiclesService.serviceDueMap();
    return { data: Array.from(map.entries()).map(([vehicleId, v]) => ({ vehicleId, ...v })) };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/compliance-summary')
  async complianceSummary() {
    return { data: await this.vehiclesService.complianceSummary() };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/fuel-log/summary')
  async fuelSummary(@Query('from') from: string, @Query('to') to: string) {
    return { data: await this.vehiclesService.fuelSummary({ from, to }) };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/:id')
  async get(@Param('id') id: string) {
    return { data: await this.vehiclesService.get(id) };
  }

  // Spec/odometer/GPS status: real operational fields, deliberately a
  // SEPARATE write surface from PATCH /vehicles/:id above -- that one stays
  // Admin-only for the vehicle master record itself (registration no, model,
  // capacity, ownership, operational status); this only ever touches the
  // spec columns query.md adds, so Transport Manager still can't rename or
  // decommission a vehicle through it. Same "Transport owns operational
  // upkeep" principle as documents/maintenance/fuel-log above.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/:id/spec')
  async getSpec(@Param('id') id: string) {
    return { data: await this.vehiclesService.getSpec(id) };
  }

  @Patch('vehicles/:id/spec')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  async updateSpec(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleSpecDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.updateSpec(id, dto, actor.personId) };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/:id/gps-status')
  async getGpsStatus(@Param('id') id: string) {
    return { data: await this.vehiclesService.getGpsStatus(id) };
  }

  // TRANSPORT_MANAGER added -- explicit product decision: Transport Manager
  // now gets real create/edit on the vehicle master record itself (not just
  // the separate /spec endpoint above). Deactivating/decommissioning a
  // vehicle is NOT part of this grant -- that stays gated behind the real
  // Admin-approval workflow below (requestDeactivate), never a direct write.
  @Post('vehicles')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateVehicleDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.create(dto, actor.personId) };
  }

  @Patch('vehicles/:id')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.update(id, dto, actor.personId) };
  }

  // Real deletion never existed for vehicles (this app's own "deactivate, not
  // delete" convention -- see school-eos-backend/.claude/CLAUDE.md); this is
  // Transport Manager's own request to deactivate (operational_status ->
  // RETIRED), routed through the generic approvals engine to a real ADMIN
  // decision -- see transport-approval-handlers.service.ts's own 'vehicle'
  // handler for what actually happens on approval. TRANSPORT_MANAGER-only:
  // Admin doesn't need to "request" their own action, they already have the
  // real PATCH above.
  @Post('vehicles/:id/request-deactivate')
  @Roles('TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async requestDeactivate(
    @Param('id') id: string,
    @Body() dto: RequestVehicleDeactivateDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.vehiclesService.requestDeactivate(id, dto, actor.personId),
    };
  }

  // VICE_PRINCIPAL added -- GET /vehicles above already grants VP; these
  // sibling read routes on the same resource didn't, an inconsistency caught
  // in a wiring audit.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/:id/documents')
  async listDocuments(@Param('id') id: string) {
    return { data: await this.vehiclesService.listDocuments(id) };
  }

  @Post('vehicles/:id/documents')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async createDocument(
    @Param('id') id: string,
    @Body() dto: CreateVehicleDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.vehiclesService.createDocument(id, dto, actor.personId),
    };
  }

  @Patch('vehicle-documents/:documentId')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() dto: UpdateVehicleDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.vehiclesService.updateDocument(
        documentId,
        dto,
        actor.personId,
      ),
    };
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

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/:id/maintenance')
  async listMaintenance(@Param('id') id: string) {
    return { data: await this.vehiclesService.listMaintenance(id) };
  }

  @Post('vehicles/:id/maintenance')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async createMaintenance(
    @Param('id') id: string,
    @Body() dto: CreateVehicleMaintenanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.vehiclesService.createMaintenance(
        id,
        dto,
        actor.personId,
      ),
    };
  }

  @Patch('vehicle-maintenance/:maintenanceId')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  async updateMaintenance(
    @Param('maintenanceId') maintenanceId: string,
    @Body() dto: UpdateVehicleMaintenanceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.vehiclesService.updateMaintenance(
        maintenanceId,
        dto,
        actor.personId,
      ),
    };
  }

  // Fuel log: same real operational-recording pattern as documents/
  // maintenance above -- Transport Manager owns day-to-day upkeep, Admin
  // retains it too, no delete route (a logged fill-up is a real fuel
  // transaction, not something to quietly remove).
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('vehicles/:id/fuel-log')
  async listFuelLog(@Param('id') id: string) {
    return { data: await this.vehiclesService.listFuelLog(id) };
  }

  @Post('vehicles/:id/fuel-log')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async createFuelLog(
    @Param('id') id: string,
    @Body() dto: CreateFuelLogDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.vehiclesService.createFuelLog(id, dto, actor.personId) };
  }
}
