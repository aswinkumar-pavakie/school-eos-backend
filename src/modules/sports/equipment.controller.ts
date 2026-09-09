import {
  Body,
  Controller,
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
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { EquipmentService } from './equipment.service';

@Roles('ADMIN')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  async list() {
    return { data: await this.equipmentService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.equipmentService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateEquipmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.equipmentService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEquipmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.equipmentService.update(id, dto, actor.personId),
    };
  }
}
