import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityInitiativesService } from './community-initiatives.service';
import { CompleteInitiativeDto } from './dto/complete-initiative.dto';
import { CreateCommunityInitiativeDto } from './dto/create-community-initiative.dto';
import { UpdateCommunityInitiativeDto } from './dto/update-community-initiative.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';

// Community-only, end to end -- same as community-proposals. Table is named
// community_initiative (see 0010_community_initiatives.sql for why); route
// segment is /community-initiatives to match, but the user-facing frontend
// route/label stays "Activities" (/community/activities) per the approved
// naming.
@Roles('COMMUNITY')
@Controller('community-initiatives')
export class CommunityInitiativesController {
  constructor(private readonly service: CommunityInitiativesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCommunityInitiativeDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor) };
  }

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor) };
  }

  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getById(id, actor) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunityInitiativeDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(id, dto, actor) };
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.start(id, actor) };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteInitiativeDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.complete(id, dto, actor) };
  }

  @Patch(':id/progress')
  async updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateProgress(id, dto, actor) };
  }
}
