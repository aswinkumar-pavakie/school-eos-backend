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
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateRouteStopDto } from './dto/create-route-stop.dto';
import { UpdateRouteStopDto } from './dto/update-route-stop.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 11),
// and to VICE_PRINCIPAL (Phase 13 mobile Transport module -- same oversight
// need, covers list/get/listStops/listAssignedStudents, all explicitly
// requested this phase) -- every write method below keeps its own narrower
// @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller()
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- these reads are reachable by
  // TRANSPORT_MANAGER too, on top of the class-level PRINCIPAL/VICE_PRINCIPAL
  // oversight grant (a method-level override fully replaces the class
  // default rather than adding to it, so both must be listed explicitly
  // here or PRINCIPAL/VICE_PRINCIPAL would silently lose read access);
  // create/update/stop-write routes below stay ADMIN-only exactly as before.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('routes')
  async list() {
    return { data: await this.routesService.list() };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('routes/:id')
  async get(@Param('id') id: string) {
    return { data: await this.routesService.get(id) };
  }

  @Post('routes')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateRouteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.routesService.create(dto, actor.personId) };
  }

  @Patch('routes/:id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.routesService.update(id, dto, actor.personId) };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('routes/:id/stops')
  async listStops(@Param('id') id: string) {
    return { data: await this.routesService.listStops(id) };
  }

  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  @Get('routes/:id/assigned-students')
  async listAssignedStudents(@Param('id') id: string) {
    return { data: await this.routesService.listAssignedStudents(id) };
  }

  @Post('routes/:id/stops')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createStop(
    @Param('id') id: string,
    @Body() dto: CreateRouteStopDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.routesService.createStop(id, dto, actor.personId),
    };
  }

  @Patch('route-stops/:stopId')
  @Roles('ADMIN')
  async updateStop(
    @Param('stopId') stopId: string,
    @Body() dto: UpdateRouteStopDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.routesService.updateStop(stopId, dto, actor.personId),
    };
  }

  @Delete('route-stops/:stopId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteStop(
    @Param('stopId') stopId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.routesService.deleteStop(stopId, actor.personId);
    return { data: { deleted: true } };
  }
}
