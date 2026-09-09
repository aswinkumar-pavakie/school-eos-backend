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
import { GpsDevicesService } from './gps-devices.service';
import { CreateGpsDeviceDto } from './dto/create-gps-device.dto';
import { UpdateGpsDeviceDto } from './dto/update-gps-device.dto';

@Roles('ADMIN')
@Controller('gps-devices')
export class GpsDevicesController {
  constructor(private readonly gpsDevicesService: GpsDevicesService) {}

  @Get()
  async list() {
    return { data: await this.gpsDevicesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.gpsDevicesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateGpsDeviceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gpsDevicesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGpsDeviceDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.gpsDevicesService.update(id, dto, actor.personId),
    };
  }
}
