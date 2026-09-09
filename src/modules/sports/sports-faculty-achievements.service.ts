// Feature #15 — achievements. Writes into the SAME shared `achievement` table
// used by the rest of the student's development profile (per the workflow
// doc's own note), not a parallel one — sports_achievement is the
// sport-specific detail row, linked back via achievement_id. Both writes
// happen in one transaction: sports_achievement first (so it has an id to
// reference), then achievement (source_domain='SPORTS', reference_id = the
// sports_achievement row), then sports_achievement.achievement_id is patched
// to point back — same two-step "insert then patch back-reference" shape
// online-classes uses for its Google Calendar event id.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateSportsAchievementDto } from './dto/create-sports-achievement.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { AchievementRepository } from './repositories/achievement.repository';
import {
  SportsAchievementRepository,
  SportsAchievementRow,
} from './repositories/sports-achievement.repository';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';

const PLACEMENT_LEVEL = 'SCHOOL'; // achievement.level has no dedicated "placement" concept — reused verbatim as the level string, since a placement (e.g. "1st place") IS the achievement's level for sports.

@Injectable()
export class SportsFacultyAchievementsService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly sportsAchievementRepo: SportsAchievementRepository,
    private readonly achievementRepo: AchievementRepository,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async requireActiveFaculty(actor: AuthenticatedUser): Promise<void> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE')
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
  }

  async list(actor: AuthenticatedUser): Promise<SportsAchievementRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.sportsAchievementRepo.findBySportIds(sportIds);
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateSportsAchievementDto,
  ): Promise<SportsAchievementRow> {
    await this.requireActiveFaculty(actor);

    const sportId = await this.sportsAchievementRepo.resolveSportId({
      teamId: dto.teamId,
      tournamentId: dto.tournamentId,
    });
    if (!sportId)
      throw new NotFoundException(
        'teamId/tournamentId does not resolve to a real sport',
      );
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.SPORT_NOT_FOUND);

    try {
      return await this.unitOfWork.run(async (client) => {
        const sportsAchievement = await this.sportsAchievementRepo.create(
          {
            studentId: dto.studentId,
            teamId: dto.teamId ?? null,
            tournamentId: dto.tournamentId ?? null,
            placement: dto.placement,
            awardedOn: dto.awardedOn,
          },
          client,
        );

        const achievement = await this.achievementRepo.create(
          {
            studentId: dto.studentId,
            title: dto.title ?? `${dto.placement} — Sports`,
            level: dto.placement || PLACEMENT_LEVEL,
            awardedOn: dto.awardedOn,
          },
          client,
        );
        await this.achievementRepo.setReferenceId(
          achievement.id,
          sportsAchievement.id,
          client,
        );
        await this.sportsAchievementRepo.linkAchievement(
          sportsAchievement.id,
          achievement.id,
          client,
        );

        const final = (await this.sportsAchievementRepo.findById(
          sportsAchievement.id,
          client,
        ))!;
        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'FACULTY',
            action: 'SPORTS_ACHIEVEMENT_CREATED',
            objectType: 'sports_achievement',
            objectId: final.id,
            outcome: 'SUCCESS',
            afterData: final,
          },
          client,
        );
        return final;
      });
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'studentId does not refer to a real, existing student',
        );
      throw err;
    }
  }
}
