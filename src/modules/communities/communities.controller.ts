import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunitiesService } from './communities.service';
import { CommunityQueryDto } from './dto/community-query.dto';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';

@Roles('ADMIN')
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get()
  async list(@Query() query: CommunityQueryDto) {
    return { data: await this.communitiesService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.communitiesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCommunityDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.communitiesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCommunityDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.communitiesService.update(id, dto, actor.personId) };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.communitiesService.archive(id, actor.personId) };
  }
}
