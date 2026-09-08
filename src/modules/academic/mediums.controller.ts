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
import { MediumsService } from './mediums.service';
import { CreateMediumDto } from './dto/create-medium.dto';
import { UpdateMediumDto } from './dto/update-medium.dto';

@Roles('ADMIN')
@Controller('mediums')
export class MediumsController {
  constructor(private readonly mediumsService: MediumsService) {}

  @Get()
  async list() {
    return { data: await this.mediumsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.mediumsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMediumDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.mediumsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediumDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.mediumsService.update(id, dto, actor.personId) };
  }
}
