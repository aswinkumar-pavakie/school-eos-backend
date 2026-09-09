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
import { CreateHostelFloorDto } from './dto/create-hostel-floor.dto';
import { UpdateHostelFloorDto } from './dto/update-hostel-floor.dto';
import { HostelBlocksService } from './hostel-blocks.service';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 12),
// and to VICE_PRINCIPAL (Vice Principal mobile Hostel module -- same
// oversight need) -- every write method below keeps its own narrower
// @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller()
export class HostelBlocksController {
  constructor(private readonly hostelBlocksService: HostelBlocksService) {}

  @Get('hostel-blocks/:id/floors')
  async listFloors(@Param('id') id: string) {
    return { data: await this.hostelBlocksService.listFloors(id) };
  }

  @Post('hostel-blocks/:id/floors')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createFloor(
    @Param('id') id: string,
    @Body() dto: CreateHostelFloorDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.hostelBlocksService.createFloor(id, dto, actor.personId),
    };
  }

  @Patch('hostel-floors/:floorId')
  @Roles('ADMIN')
  async updateFloor(
    @Param('floorId') floorId: string,
    @Body() dto: UpdateHostelFloorDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.hostelBlocksService.updateFloor(
        floorId,
        dto,
        actor.personId,
      ),
    };
  }
}
