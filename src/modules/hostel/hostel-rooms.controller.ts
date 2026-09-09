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
import { CreateHostelBedDto } from './dto/create-hostel-bed.dto';
import { UpdateHostelBedDto } from './dto/update-hostel-bed.dto';
import { HostelRoomsService } from './hostel-rooms.service';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 12),
// and to VICE_PRINCIPAL (Vice Principal mobile Hostel module -- same
// oversight need) -- every write method below keeps its own narrower
// @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller()
export class HostelRoomsController {
  constructor(private readonly hostelRoomsService: HostelRoomsService) {}

  @Get('hostel-rooms/:id/beds')
  async listBeds(@Param('id') id: string) {
    return { data: await this.hostelRoomsService.listBeds(id) };
  }

  @Post('hostel-rooms/:id/beds')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createBed(
    @Param('id') id: string,
    @Body() dto: CreateHostelBedDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.hostelRoomsService.createBed(id, dto, actor.personId),
    };
  }

  @Patch('hostel-beds/:bedId')
  @Roles('ADMIN')
  async updateBed(
    @Param('bedId') bedId: string,
    @Body() dto: UpdateHostelBedDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.hostelRoomsService.updateBed(bedId, dto, actor.personId),
    };
  }
}
