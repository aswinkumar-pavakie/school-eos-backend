import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateHostelRoomDto } from './dto/create-hostel-room.dto';
import { UpdateHostelRoomDto } from './dto/update-hostel-room.dto';
import { HostelFloorsService } from './hostel-floors.service';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 12);
// every write method below keeps its own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class HostelFloorsController {
  constructor(private readonly hostelFloorsService: HostelFloorsService) {}

  @Get('hostel-floors/:id/rooms')
  async listRooms(@Param('id') id: string) {
    return { data: await this.hostelFloorsService.listRooms(id) };
  }

  @Post('hostel-floors/:id/rooms')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createRoom(
    @Param('id') id: string,
    @Body() dto: CreateHostelRoomDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelFloorsService.createRoom(id, dto, actor.personId) };
  }

  @Patch('hostel-rooms/:roomId')
  @Roles('ADMIN')
  async updateRoom(
    @Param('roomId') roomId: string,
    @Body() dto: UpdateHostelRoomDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelFloorsService.updateRoom(roomId, dto, actor.personId) };
  }
}
