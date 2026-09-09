import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { VehicleRouteAssignmentsService } from './vehicle-route-assignments.service';
import { CreateVehicleRouteAssignmentDto } from './dto/create-vehicle-route-assignment.dto';
import { UpdateVehicleRouteAssignmentDto } from './dto/update-vehicle-route-assignment.dto';
import { VehicleRouteAssignmentQueryDto } from './dto/vehicle-route-assignment-query.dto';

@Roles('ADMIN')
@Controller('vehicle-route-assignments')
export class VehicleRouteAssignmentsController {
  constructor(private readonly assignmentsService: VehicleRouteAssignmentsService) {}

  @Get()
  async list(@Query() query: VehicleRouteAssignmentQueryDto) {
    return { data: await this.assignmentsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.assignmentsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateVehicleRouteAssignmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.assignmentsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleRouteAssignmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.assignmentsService.update(id, dto, actor.personId) };
  }
}
