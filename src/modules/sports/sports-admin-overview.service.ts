// Admin's read-only oversight over Sports Faculty operations (teams,
// tournaments/fixtures, OD requests, achievements, equipment issues) --
// mirrors the /admin/library oversight pattern: Admin never gets a second
// operator UI for Faculty's own work, only a summary. Every list here is
// school-wide (every sport, not filtered by any one Faculty member's
// assignments), reusing each repository's existing findBySportIds() by
// passing every sport id rather than a Faculty-derived subset -- no new SQL.

import { Injectable } from '@nestjs/common';
import { EquipmentIssueRepository } from './repositories/equipment-issue.repository';
import { FixtureRepository } from './repositories/fixture.repository';
import { SportOdRequestRepository } from './repositories/sport-od-request.repository';
import { SportRepository } from './repositories/sport.repository';
import { SportsAchievementRepository } from './repositories/sports-achievement.repository';
import { TeamRepository } from './repositories/team.repository';
import { TournamentRepository } from './repositories/tournament.repository';

const RECENT_LIMIT = 20;

@Injectable()
export class SportsAdminOverviewService {
  constructor(
    private readonly sportRepo: SportRepository,
    private readonly teamRepo: TeamRepository,
    private readonly tournamentRepo: TournamentRepository,
    private readonly fixtureRepo: FixtureRepository,
    private readonly odRequestRepo: SportOdRequestRepository,
    private readonly achievementRepo: SportsAchievementRepository,
    private readonly equipmentIssueRepo: EquipmentIssueRepository,
  ) {}

  async getOverview() {
    const sports = await this.sportRepo.findMany();
    const sportIds = sports.map((s) => s.id);

    const [teams, tournaments, fixtures, odRequests, achievements, outstandingIssues] =
      await Promise.all([
        this.teamRepo.findBySportIds(sportIds),
        this.tournamentRepo.findBySportIds(sportIds),
        this.fixtureRepo.findBySportIds(sportIds),
        this.odRequestRepo.findBySportIds(sportIds),
        this.achievementRepo.findBySportIds(sportIds),
        this.equipmentIssueRepo.findOutstandingBySportIds(sportIds),
      ]);

    const now = Date.now();
    const outstandingWithOverdueFlag = outstandingIssues.map((i) => ({
      ...i,
      overdue: i.dueOn !== null && new Date(i.dueOn).getTime() < now,
    }));
    const overdueCount = outstandingWithOverdueFlag.filter((i) => i.overdue).length;

    return {
      totals: {
        teams: teams.length,
        tournaments: tournaments.length,
        ongoingTournaments: tournaments.filter((t) => t.state === 'ONGOING').length,
        upcomingFixtures: fixtures.filter(
          (f) => f.status === 'SCHEDULED' && new Date(f.scheduledAt).getTime() > now,
        ).length,
        pendingOdRequests: odRequests.filter((r) => r.state === 'PENDING').length,
        outstandingEquipmentIssues: outstandingIssues.length,
        overdueEquipmentIssues: overdueCount,
      },
      teams,
      tournaments,
      odRequests: odRequests.slice(0, RECENT_LIMIT),
      achievements: achievements.slice(0, RECENT_LIMIT),
      outstandingEquipmentIssues: outstandingWithOverdueFlag,
    };
  }
}
