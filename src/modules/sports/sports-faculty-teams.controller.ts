// Sports Faculty (mobile) — teams & rosters. Every route is scoped server-side
// to the sport(s) this Faculty member currently holds a SPORTS_FACULTY
// assignment for (see SportsFacultyTeamsService) — never school-wide.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { AssignCoachDto } from './dto/assign-coach.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { SportsFacultyTeamsService } from './sports-faculty-teams.service';

@Roles('FACULTY')
@Controller('sports/teams')
export class SportsFacultyTeamsController {
  constructor(private readonly service: SportsFacultyTeamsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMyTeams(actor) };
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getTeam(actor, id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTeamDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createTeam(actor, dto) };
  }

  @Get(':id/roster')
  async listRoster(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listRoster(actor, id) };
  }

  @Post(':id/roster')
  @HttpCode(HttpStatus.CREATED)
  async addRosterMember(
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.addRosterMember(actor, id, dto) };
  }

  @Post(':id/roster/:memberId/end')
  @HttpCode(HttpStatus.OK)
  async endRosterMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.endRosterMember(actor, id, memberId);
    return { data: { ended: true } };
  }

  // Feature #16 — coach-to-team assignment.
  @Post(':id/coach')
  @HttpCode(HttpStatus.OK)
  async assignCoach(
    @Param('id') id: string,
    @Body() dto: AssignCoachDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.assignCoach(actor, id, dto) };
  }
}
