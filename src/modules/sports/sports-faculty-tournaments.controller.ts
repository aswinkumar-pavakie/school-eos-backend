// Feature #14 — tournaments, fixtures, results. Feature #17 (house-wise
// performance) is served here too — GET /sports/houses/performance — since it
// reads the exact same fixture_result data this controller otherwise manages.

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
import { CreateFixtureDto } from './dto/create-fixture.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { RecordFixtureResultDto } from './dto/record-fixture-result.dto';
import { UpdateFixtureDto } from './dto/update-fixture.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { SportsFacultyTournamentsService } from './sports-faculty-tournaments.service';

@Roles('FACULTY')
@Controller('sports/tournaments')
export class SportsFacultyTournamentsController {
  constructor(private readonly service: SportsFacultyTournamentsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listTournaments(actor) };
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getTournament(actor, id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTournamentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createTournament(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateTournament(actor, id, dto) };
  }

  @Post(':id/fixtures')
  @HttpCode(HttpStatus.CREATED)
  async createFixture(
    @Param('id') tournamentId: string,
    @Body() dto: CreateFixtureDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createFixture(actor, tournamentId, dto) };
  }
}

@Roles('FACULTY')
@Controller('sports/fixtures')
export class SportsFacultyFixturesController {
  constructor(private readonly service: SportsFacultyTournamentsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listFixtures(actor) };
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getFixture(actor, id) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFixtureDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateFixture(actor, id, dto) };
  }

  @Get(':id/results')
  async getResult(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getResult(actor, id) };
  }

  @Post(':id/results')
  @HttpCode(HttpStatus.CREATED)
  async recordResult(
    @Param('id') id: string,
    @Body() dto: RecordFixtureResultDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.recordResult(actor, id, dto) };
  }
}

@Roles('FACULTY')
@Controller('sports/houses')
export class SportsHousesController {
  constructor(private readonly service: SportsFacultyTournamentsService) {}

  @Get('performance')
  async performance(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.housePerformance(actor) };
  }
}
