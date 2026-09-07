import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateMediaTeamMemberDto } from './dto/create-media-team-member.dto';
import { UpdateMediaTeamMemberDto } from './dto/update-media-team-member.dto';
import { MediaTeamService } from './media-team.service';

// PRINCIPAL is read-only oversight here, same as everywhere else -- every
// write method below carries its own narrower @Roles('MEDIA_ROOM', 'ADMIN')
// override (RolesGuard's Reflector.getAllAndOverride means a method-level
// @Roles fully replaces the class-level one).
@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/team')
export class MediaTeamController {
  constructor(private readonly service: MediaTeamService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMediaTeamMemberDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('MEDIA_ROOM', 'ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateMediaTeamMemberDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.update(id, dto, actor.personId) };
  }
}
