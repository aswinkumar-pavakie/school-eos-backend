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
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { UpdateDriverDocumentDto } from './dto/update-driver-document.dto';
import { RequestDriverDeactivateDto } from './dto/request-driver-deactivate.dto';

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

  // TRANSPORT_MANAGER added here deliberately (explicit product decision) --
  // real edit access on the driver's own record (name/phone/licence/
  // experience/blood group), same "Transport owns operational upkeep"
  // principle as vehicle/route edit. Create stays Admin-only; "removing" a
  // driver is a real deactivation routed through the approval workflow
  // below (request-deactivate), not a direct PATCH status write.
  @Patch(':id')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.driversService.update(id, dto, actor.personId) };
  }

  // No real hard-delete exists for a driver -- "removing" one is a real
  // request to deactivate (status -> INACTIVE), routed through the generic
  // approvals engine to a real ADMIN decision, same pattern as vehicle/
  // route/route-stop/student-allocation deactivation this session.
  @Post(':id/request-deactivate')
  @Roles('TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async requestDeactivate(
    @Param('id') id: string,
    @Body() dto: RequestDriverDeactivateDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.driversService.requestDeactivate(id, dto, actor.personId) };
  }

  // Driver documents: same role split as vehicle documents on
  // VehiclesController -- TRANSPORT_MANAGER has real operational access
  // (list/create/update), delete stays ADMIN-only.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get(':id/documents')
  async listDocuments(@Param('id') id: string) {
    return { data: await this.driversService.listDocuments(id) };
  }

  @Post(':id/documents')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async createDocument(
    @Param('id') id: string,
    @Body() dto: CreateDriverDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.driversService.createDocument(id, dto, actor.personId),
    };
  }

  @Patch('documents/:documentId')
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDriverDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.driversService.updateDocument(
        documentId,
        dto,
        actor.personId,
      ),
    };
  }

  @Delete('documents/:documentId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(
    @Param('documentId') documentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.driversService.deleteDocument(documentId, actor.personId);
    return { data: { deleted: true } };
  }
}
