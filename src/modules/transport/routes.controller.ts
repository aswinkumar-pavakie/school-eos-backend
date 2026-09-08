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

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 11);
// every write method below keeps its own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get('routes')
  async list() {
    return { data: await this.routesService.list() };
  }

  @Get('routes/:id')
  async get(@Param('id') id: string) {
    return { data: await this.routesService.get(id) };
  }

  @Post('routes')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRouteDto, @CurrentActor() actor: AuthenticatedUser) {
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

  @Get('routes/:id/stops')
  async listStops(@Param('id') id: string) {
    return { data: await this.routesService.listStops(id) };
  }

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
    return { data: await this.routesService.createStop(id, dto, actor.personId) };
  }

  @Patch('route-stops/:stopId')
  @Roles('ADMIN')
  async updateStop(
    @Param('stopId') stopId: string,
    @Body() dto: UpdateRouteStopDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.routesService.updateStop(stopId, dto, actor.personId) };
  }

  @Delete('route-stops/:stopId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteStop(@Param('stopId') stopId: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.routesService.deleteStop(stopId, actor.personId);
    return { data: { deleted: true } };
  }
}
