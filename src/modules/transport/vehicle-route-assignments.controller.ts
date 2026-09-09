import {
  Body,
  Controller,
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
import { VehicleRouteAssignmentsService } from './vehicle-route-assignments.service';
import { CreateVehicleRouteAssignmentDto } from './dto/create-vehicle-route-assignment.dto';
import { UpdateVehicleRouteAssignmentDto } from './dto/update-vehicle-route-assignment.dto';
import { VehicleRouteAssignmentQueryDto } from './dto/vehicle-route-assignment-query.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 11),
// and to VICE_PRINCIPAL (Phase 13 mobile Transport module -- same oversight
// need, this is exactly the vehicle<->route<->driver linkage that module
// needs) -- every write method below keeps its own narrower @Roles('ADMIN')
// override.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('vehicle-route-assignments')
export class VehicleRouteAssignmentsController {
  constructor(
    private readonly assignmentsService: VehicleRouteAssignmentsService,
  ) {}

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- these reads are reachable by
  // TRANSPORT_MANAGER too, on top of the class-level PRINCIPAL/VICE_PRINCIPAL
  // oversight grant (a method-level override fully replaces the class
  // default rather than adding to it, so both must be listed explicitly
  // here or PRINCIPAL/VICE_PRINCIPAL would silently lose read access).
  // Unlike the other transport controllers, TRANSPORT_MANAGER gets
  // create/update here too, not just read -- this is the real
  // driver<->vehicle assignment action ("assign/manage drivers where
  // permitted"), the one write Transport Manager is meant to perform.
  // Vehicle/route/driver/attendant master data and student allocation stay
  // ADMIN-only.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get()
  async list(@Query() query: VehicleRouteAssignmentQueryDto) {
    return { data: await this.assignmentsService.list(query) };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.assignmentsService.get(id) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateVehicleRouteAssignmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.assignmentsService.create(dto, actor.personId) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleRouteAssignmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.assignmentsService.update(id, dto, actor.personId),
    };
  }
}
