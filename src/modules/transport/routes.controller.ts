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

@Roles('ADMIN')
@Controller()
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- these reads are reachable by
  // TRANSPORT_MANAGER too; create/update/stop-write routes below stay
  // ADMIN-only exactly as before.
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get('routes')
  async list() {
    return { data: await this.routesService.list() };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get('routes/:id')
  async get(@Param('id') id: string) {
    return { data: await this.routesService.get(id) };
  }

  @Post('routes')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateRouteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.routesService.create(dto, actor.personId) };
  }

  @Patch('routes/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.routesService.update(id, dto, actor.personId) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get('routes/:id/stops')
  async listStops(@Param('id') id: string) {
    return { data: await this.routesService.listStops(id) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get('routes/:id/assigned-students')
  async listAssignedStudents(@Param('id') id: string) {
    return { data: await this.routesService.listAssignedStudents(id) };
  }

  @Post('routes/:id/stops')
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
  @HttpCode(HttpStatus.OK)
  async deleteStop(
    @Param('stopId') stopId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.routesService.deleteStop(stopId, actor.personId);
    return { data: { deleted: true } };
  }
}
