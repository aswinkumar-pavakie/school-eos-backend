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
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunitiesService } from './communities.service';
import { CommunityQueryDto } from './dto/community-query.dto';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 17),
// and to COMMUNITY (the new standalone Community login's own dashboard-level
// summary, Phase 3 of that separate initiative -- read-only here too, same
// as Principal's) -- every write method below keeps its own narrower
// @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'COMMUNITY')
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get()
  async list(@Query() query: CommunityQueryDto) {
    return { data: await this.communitiesService.list(query) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.communitiesService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCommunityDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.communitiesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommunityDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.communitiesService.update(id, dto, actor.personId),
    };
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.communitiesService.archive(id, actor.personId) };
  }
}
