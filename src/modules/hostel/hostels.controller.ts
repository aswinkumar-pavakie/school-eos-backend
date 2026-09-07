import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateHostelBlockDto } from './dto/create-hostel-block.dto';
import { CreateHostelDto } from './dto/create-hostel.dto';
import { UpdateHostelBlockDto } from './dto/update-hostel-block.dto';
import { UpdateHostelDto } from './dto/update-hostel.dto';
import { HostelsService } from './hostels.service';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 12);
// every write method below keeps its own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class HostelsController {
  constructor(private readonly hostelsService: HostelsService) {}

  @Get('hostels')
  async list() {
    return { data: await this.hostelsService.list() };
  }

  @Get('hostels/:id')
  async get(@Param('id') id: string) {
    return { data: await this.hostelsService.get(id) };
  }

  @Post('hostels')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateHostelDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.hostelsService.create(dto, actor.personId) };
  }

  @Patch('hostels/:id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHostelDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelsService.update(id, dto, actor.personId) };
  }

  @Get('hostels/:id/blocks')
  async listBlocks(@Param('id') id: string) {
    return { data: await this.hostelsService.listBlocks(id) };
  }

  @Post('hostels/:id/blocks')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createBlock(
    @Param('id') id: string,
    @Body() dto: CreateHostelBlockDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelsService.createBlock(id, dto, actor.personId) };
  }

  @Patch('hostel-blocks/:blockId')
  @Roles('ADMIN')
  async updateBlock(
    @Param('blockId') blockId: string,
    @Body() dto: UpdateHostelBlockDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.hostelsService.updateBlock(blockId, dto, actor.personId) };
  }
}
