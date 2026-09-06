import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateShootAssignmentDto } from './dto/create-shoot-assignment.dto';
import { ShootAssignmentQueryDto } from './dto/shoot-assignment-query.dto';
import { UpdateShootAssignmentDto } from './dto/update-shoot-assignment.dto';
import { ShootAssignmentsService } from './shoot-assignments.service';

@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/shoot-assignments')
export class ShootAssignmentsController {
  constructor(private readonly service: ShootAssignmentsService) {}

  @Get()
  async list(@Query() query: ShootAssignmentQueryDto) {
    return { data: await this.service.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.service.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateShootAssignmentDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateShootAssignmentDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.update(id, dto, actor.personId) };
  }
}
