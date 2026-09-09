import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateHostelFloorDto } from './dto/create-hostel-floor.dto';
import { UpdateHostelFloorDto } from './dto/update-hostel-floor.dto';
import { HostelBlocksService } from './hostel-blocks.service';

@Roles('ADMIN')
@Controller()
export class HostelBlocksController {
  constructor(private readonly hostelBlocksService: HostelBlocksService) {}

  @Get('hostel-blocks/:id/floors')
  async listFloors(@Param('id') id: string) {
    return { data: await this.hostelBlocksService.listFloors(id) };
  }

  @Post('hostel-blocks/:id/floors')
  @HttpCode(HttpStatus.CREATED)
  async createFloor(
    @Param('id') id: string,
    @Body() dto: CreateHostelFloorDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelBlocksService.createFloor(id, dto, actor.personId) };
  }

  @Patch('hostel-floors/:floorId')
  async updateFloor(
    @Param('floorId') floorId: string,
    @Body() dto: UpdateHostelFloorDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelBlocksService.updateFloor(floorId, dto, actor.personId) };
  }
}
