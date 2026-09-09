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
import { GpsDeviceMappingsService } from './gps-device-mappings.service';
import { CreateGpsDeviceMappingDto } from './dto/create-gps-device-mapping.dto';
import { UpdateGpsDeviceMappingDto } from './dto/update-gps-device-mapping.dto';
import { GpsDeviceMappingQueryDto } from './dto/gps-device-mapping-query.dto';

@Roles('ADMIN')
@Controller('gps-device-mappings')
export class GpsDeviceMappingsController {
  constructor(private readonly mappingsService: GpsDeviceMappingsService) {}

  @Get()
  async list(@Query() query: GpsDeviceMappingQueryDto) {
    return { data: await this.mappingsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.mappingsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateGpsDeviceMappingDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.mappingsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGpsDeviceMappingDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.mappingsService.update(id, dto, actor.personId) };
  }
}
