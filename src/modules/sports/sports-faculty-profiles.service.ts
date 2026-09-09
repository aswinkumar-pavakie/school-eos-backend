// Feature #12 — student sport profile. Sports Faculty (mobile), sport-scoped.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { UpdateSportsProfileDto } from './dto/update-sports-profile.dto';
import { UpsertSportsProfileDto } from './dto/upsert-sports-profile.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import {
  SportsProfileRepository,
  SportsProfileRow,
} from './repositories/sports-profile.repository';
import { StaffRepository } from './repositories/staff.repository';

@Injectable()
export class SportsFacultyProfilesService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly profileRepo: SportsProfileRepository,
    private readonly audit: AuditService,
  ) {}

  private async requireActiveFaculty(actor: AuthenticatedUser): Promise<void> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE')
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
  }

  async listBySport(
    actor: AuthenticatedUser,
    sportId: string,
  ): Promise<SportsProfileRow[]> {
    await this.requireActiveFaculty(actor);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.SPORT_NOT_FOUND);
    const mine = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.profileRepo.findBySportIds(mine.filter((id) => id === sportId));
  }

  async create(
    actor: AuthenticatedUser,
    sportId: string,
    dto: UpsertSportsProfileDto,
  ): Promise<SportsProfileRow> {
    await this.requireActiveFaculty(actor);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.SPORT_NOT_FOUND);

    try {
      const profile = await this.profileRepo.upsert({ sportId, ...dto });
      await this.audit.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'FACULTY',
        action: 'SPORTS_PROFILE_UPSERTED',
        objectType: 'sports_profile',
        objectId: profile.id,
        outcome: 'SUCCESS',
        afterData: profile,
      });
      return profile;
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'studentId or sportCategoryId does not refer to a real, existing row',
        );
      throw err;
    }
  }

  async update(
    actor: AuthenticatedUser,
    sportId: string,
    profileId: string,
    dto: UpdateSportsProfileDto,
  ): Promise<SportsProfileRow> {
    await this.requireActiveFaculty(actor);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.SPORT_NOT_FOUND);

    const existing = await this.profileRepo.findById(profileId);
    if (!existing || existing.sportId !== sportId)
      throw new NotFoundException('Sport profile not found');

    const updated = await this.profileRepo.update(profileId, dto);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_PROFILE_UPDATED',
      objectType: 'sports_profile',
      objectId: profileId,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated!;
  }
}
