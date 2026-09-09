// Sports Operations — teams & rosters (Sports Faculty, mobile). Every method
// re-derives live authorization from SportsFacultyRepository (role_assignment,
// role_code='SPORTS_FACULTY', scope_type='SPORT') — never from a stored
// created_by column — mirroring the "never trust stored ownership" convention
// used throughout this codebase (messaging/permissions/online-classes).

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { AssignCoachDto } from './dto/assign-coach.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { CoachRepository } from './repositories/coach.repository';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';
import {
  TeamMemberRepository,
  TeamMemberRow,
} from './repositories/team-member.repository';
import { TeamRepository, TeamRow } from './repositories/team.repository';

@Injectable()
export class SportsFacultyTeamsService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly teamRepo: TeamRepository,
    private readonly teamMemberRepo: TeamMemberRepository,
    private readonly coachRepo: CoachRepository,
    private readonly audit: AuditService,
  ) {}

  private async requireActiveFaculty(
    actor: AuthenticatedUser,
  ): Promise<{ id: string; personId: string }> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE') {
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
    }
    return staff;
  }

  async listMyTeams(actor: AuthenticatedUser): Promise<TeamRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.teamRepo.findBySportIds(sportIds);
  }

  private async getAuthorizedTeamOrThrow(
    actor: AuthenticatedUser,
    teamId: string,
  ): Promise<TeamRow> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      team.sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);
    return team;
  }

  async getTeam(actor: AuthenticatedUser, teamId: string): Promise<TeamRow> {
    await this.requireActiveFaculty(actor);
    return this.getAuthorizedTeamOrThrow(actor, teamId);
  }

  async createTeam(
    actor: AuthenticatedUser,
    dto: CreateTeamDto,
  ): Promise<TeamRow> {
    await this.requireActiveFaculty(actor);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      dto.sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.SPORT_NOT_FOUND);

    try {
      const team = await this.teamRepo.create(dto);
      await this.audit.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'FACULTY',
        action: 'SPORTS_TEAM_CREATED',
        objectType: 'team',
        objectId: team.id,
        outcome: 'SUCCESS',
        afterData: team,
      });
      return team;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ForbiddenException(
          'A team with this name already exists for this sport and academic year',
        );
      if (isForeignKeyViolation(err))
        throw new NotFoundException('One of the referenced ids does not exist');
      throw err;
    }
  }

  async listRoster(
    actor: AuthenticatedUser,
    teamId: string,
  ): Promise<TeamMemberRow[]> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedTeamOrThrow(actor, teamId);
    return this.teamMemberRepo.findActiveByTeam(teamId);
  }

  async addRosterMember(
    actor: AuthenticatedUser,
    teamId: string,
    dto: AddTeamMemberDto,
  ): Promise<TeamMemberRow> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedTeamOrThrow(actor, teamId);
    try {
      const member = await this.teamMemberRepo.add({ teamId, ...dto });
      await this.audit.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'FACULTY',
        action: 'SPORTS_ROSTER_MEMBER_ADDED',
        objectType: 'team_member',
        objectId: member.id,
        outcome: 'SUCCESS',
        afterData: member,
      });
      return member;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ForbiddenException(SPORTS_ERRORS.ALREADY_ON_ROSTER);
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'studentId does not refer to a real, existing student',
        );
      throw err;
    }
  }

  async endRosterMember(
    actor: AuthenticatedUser,
    teamId: string,
    memberId: string,
  ): Promise<void> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedTeamOrThrow(actor, teamId);
    const member = await this.teamMemberRepo.findById(memberId);
    if (!member || member.teamId !== teamId)
      throw new NotFoundException(SPORTS_ERRORS.ROSTER_MEMBER_NOT_FOUND);
    const ended = await this.teamMemberRepo.end(memberId);
    if (!ended)
      throw new NotFoundException(SPORTS_ERRORS.ROSTER_MEMBER_NOT_FOUND);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_ROSTER_MEMBER_ENDED',
      objectType: 'team_member',
      objectId: memberId,
      outcome: 'SUCCESS',
    });
  }

  // ---- Feature #16 — coach-to-team assignment ------------------------------------------

  /** coach registration itself stays Admin-only (CoachesController) — this
   * only assigns/reassigns an EXISTING coach row to a team this Faculty
   * member is authorized for. */
  async assignCoach(
    actor: AuthenticatedUser,
    teamId: string,
    dto: AssignCoachDto,
  ): Promise<TeamRow> {
    await this.requireActiveFaculty(actor);
    const existing = await this.getAuthorizedTeamOrThrow(actor, teamId);

    const coach = await this.coachRepo.findById(dto.coachId);
    if (!coach) throw new NotFoundException('Coach not found');

    const updated = await this.teamRepo.updateCoach(teamId, dto.coachId);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_TEAM_COACH_ASSIGNED',
      objectType: 'team',
      objectId: teamId,
      outcome: 'SUCCESS',
      beforeData: { coachId: existing.coachId },
      afterData: { coachId: dto.coachId },
    });
    return updated!;
  }
}
