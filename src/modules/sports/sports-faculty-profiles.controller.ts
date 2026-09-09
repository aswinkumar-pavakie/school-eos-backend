// Feature #12 — student sport profile.

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
import { UpdateSportsProfileDto } from './dto/update-sports-profile.dto';
import { UpsertSportsProfileDto } from './dto/upsert-sports-profile.dto';
import { SportsFacultyProfilesService } from './sports-faculty-profiles.service';

@Roles('FACULTY')
@Controller('sports/:sportId/profiles')
export class SportsFacultyProfilesController {
  constructor(private readonly service: SportsFacultyProfilesService) {}

  @Get()
  async list(
    @Param('sportId') sportId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listBySport(actor, sportId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('sportId') sportId: string,
    @Body() dto: UpsertSportsProfileDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(actor, sportId, dto) };
  }

  @Patch(':profileId')
  async update(
    @Param('sportId') sportId: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateSportsProfileDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(actor, sportId, profileId, dto) };
  }
}
