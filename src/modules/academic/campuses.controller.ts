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
import { CampusesService } from './campuses.service';
import { CreateCampusDto } from './dto/create-campus.dto';
import { UpdateCampusDto } from './dto/update-campus.dto';

@Roles('ADMIN')
@Controller('campuses')
export class CampusesController {
  constructor(private readonly campusesService: CampusesService) {}

  @Get()
  async list() {
    return { data: await this.campusesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.campusesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCampusDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.campusesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCampusDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.campusesService.update(id, dto, actor.personId) };
  }

  @Post(':id/set-primary')
  @HttpCode(HttpStatus.OK)
  async setPrimary(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.campusesService.setPrimary(id, actor.personId) };
  }
}
