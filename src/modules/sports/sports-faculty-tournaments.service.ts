// Feature #14 — tournaments, fixtures, results. Sport-scoped throughout.
// "A result cannot be recorded before the fixture's scheduled start time" is a
// real server-side check (see recordResult) per the workflow doc's own note —
// never trust a client-side date picker to enforce this.

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateFixtureDto } from './dto/create-fixture.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { RecordFixtureResultDto } from './dto/record-fixture-result.dto';
import { UpdateFixtureDto } from './dto/update-fixture.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import {
  FixtureResultRepository,
  FixtureResultRow,
  HousePerformanceRow,
} from './repositories/fixture-result.repository';
import {
  FixtureRepository,
  FixtureRow,
} from './repositories/fixture.repository';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';
import {
  TournamentRepository,
  TournamentRow,
} from './repositories/tournament.repository';

@Injectable()
export class SportsFacultyTournamentsService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly tournamentRepo: TournamentRepository,
    private readonly fixtureRepo: FixtureRepository,
    private readonly fixtureResultRepo: FixtureResultRepository,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async requireActiveFaculty(actor: AuthenticatedUser): Promise<void> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE')
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
  }

  // ---- Tournaments -----------------------------------------------------------------

  async listTournaments(actor: AuthenticatedUser): Promise<TournamentRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.tournamentRepo.findBySportIds(sportIds);
  }

  private async getAuthorizedTournamentOrThrow(
    actor: AuthenticatedUser,
    tournamentId: string,
  ): Promise<TournamentRow> {
    const tournament = await this.tournamentRepo.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      tournament.sportId,
    );
    if (!authorized) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  async getTournament(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<TournamentRow> {
    await this.requireActiveFaculty(actor);
    return this.getAuthorizedTournamentOrThrow(actor, id);
  }

  async createTournament(
    actor: AuthenticatedUser,
    dto: CreateTournamentDto,
  ): Promise<TournamentRow> {
    await this.requireActiveFaculty(actor);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      dto.sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.SPORT_NOT_FOUND);
    if (new Date(dto.endDate).getTime() < new Date(dto.startDate).getTime()) {
      throw new ConflictException('endDate must be on or after startDate');
    }

    const tournament = await this.tournamentRepo.create(dto);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_TOURNAMENT_CREATED',
      objectType: 'tournament',
      objectId: tournament.id,
      outcome: 'SUCCESS',
      afterData: tournament,
    });
    return tournament;
  }

  async updateTournament(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTournamentDto,
  ): Promise<TournamentRow> {
    await this.requireActiveFaculty(actor);
    const existing = await this.getAuthorizedTournamentOrThrow(actor, id);
    const updated = await this.tournamentRepo.update(id, dto);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_TOURNAMENT_UPDATED',
      objectType: 'tournament',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated!;
  }

  // ---- Fixtures ---------------------------------------------------------------------

  async listFixtures(actor: AuthenticatedUser): Promise<FixtureRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.fixtureRepo.findBySportIds(sportIds);
  }

  private async getAuthorizedFixtureOrThrow(
    actor: AuthenticatedUser,
    fixtureId: string,
  ): Promise<FixtureRow> {
    const fixture = await this.fixtureRepo.findById(fixtureId);
    if (!fixture) throw new NotFoundException('Fixture not found');
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      fixture.sportId,
    );
    if (!authorized) throw new NotFoundException('Fixture not found');
    return fixture;
  }

  async getFixture(actor: AuthenticatedUser, id: string): Promise<FixtureRow> {
    await this.requireActiveFaculty(actor);
    return this.getAuthorizedFixtureOrThrow(actor, id);
  }

  async createFixture(
    actor: AuthenticatedUser,
    tournamentId: string,
    dto: CreateFixtureDto,
  ): Promise<FixtureRow> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedTournamentOrThrow(actor, tournamentId);

    try {
      const fixture = await this.fixtureRepo.create({ tournamentId, ...dto });
      await this.audit.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'FACULTY',
        action: 'SPORTS_FIXTURE_CREATED',
        objectType: 'fixture',
        objectId: fixture.id,
        outcome: 'SUCCESS',
        afterData: fixture,
      });
      return fixture;
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'homeTeamId/awayTeamId does not refer to a real, existing team',
        );
      throw err;
    }
  }

  async updateFixture(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateFixtureDto,
  ): Promise<FixtureRow> {
    await this.requireActiveFaculty(actor);
    const existing = await this.getAuthorizedFixtureOrThrow(actor, id);
    const updated = await this.fixtureRepo.update(id, dto);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_FIXTURE_UPDATED',
      objectType: 'fixture',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated!;
  }

  // ---- Results ------------------------------------------------------------------------

  async recordResult(
    actor: AuthenticatedUser,
    fixtureId: string,
    dto: RecordFixtureResultDto,
  ): Promise<FixtureResultRow> {
    await this.requireActiveFaculty(actor);
    const fixture = await this.getAuthorizedFixtureOrThrow(actor, fixtureId);

    if (fixture.scheduledAt.getTime() > Date.now()) {
      throw new ConflictException(
        "A result cannot be recorded before the fixture's scheduled start time",
      );
    }
    if (
      dto.winnerTeamId &&
      dto.winnerTeamId !== fixture.homeTeamId &&
      dto.winnerTeamId !== fixture.awayTeamId
    ) {
      throw new ConflictException(
        "winnerTeamId must be either the fixture's home or away team",
      );
    }

    try {
      return await this.unitOfWork.run(async (client) => {
        const result = await this.fixtureResultRepo.create(
          { fixtureId, ...dto, recordedBy: actor.personId },
          client,
        );
        await this.fixtureRepo.update(
          fixtureId,
          { status: 'COMPLETED' },
          client,
        );
        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'FACULTY',
            action: 'SPORTS_FIXTURE_RESULT_RECORDED',
            objectType: 'fixture_result',
            objectId: result.id,
            outcome: 'SUCCESS',
            afterData: result,
          },
          client,
        );
        return result;
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A result has already been recorded for this fixture',
        );
      throw err;
    }
  }

  async getResult(
    actor: AuthenticatedUser,
    fixtureId: string,
  ): Promise<FixtureResultRow | null> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedFixtureOrThrow(actor, fixtureId);
    return this.fixtureResultRepo.findByFixtureId(fixtureId);
  }

  // ---- Feature #17 — house-wise performance --------------------------------------------

  async housePerformance(
    actor: AuthenticatedUser,
  ): Promise<HousePerformanceRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.fixtureResultRepo.getHousePerformanceBySportIds(sportIds);
  }
}
