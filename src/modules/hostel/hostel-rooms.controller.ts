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

@Roles('ADMIN')
@Controller()
export class HostelRoomsController {
  constructor(private readonly hostelRoomsService: HostelRoomsService) {}

  @Get('hostel-rooms/:id/beds')
  async listBeds(@Param('id') id: string) {
    return { data: await this.hostelRoomsService.listBeds(id) };
  }

  @Post('hostel-rooms/:id/beds')
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
