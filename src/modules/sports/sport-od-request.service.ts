// Sports Operations — OD (on-duty) requests for a match/fixture. PT teacher
// raises one for a team; it routes through the generic approvals engine
// (single PRINCIPAL step, see query.md's SPORTS_OD_REQUEST policy seed) exactly
// like Finance's purchase_request already does for a different subject type.
// On approval, SportsOdApprovalHandlers (this module's own OnModuleInit,
// mirroring FinanceApprovalHandlers) creates the actual parent-facing consent
// request by reusing the ALREADY-LIVE student_event/student_event_participant
// tables (see student-events module) — no new parent-facing code at all.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateSportOdRequestDto } from './dto/create-sport-od-request.dto';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';
import {
  SportOdRequestRepository,
  SportOdRequestRow,
} from './repositories/sport-od-request.repository';
import { TeamMemberRepository } from './repositories/team-member.repository';
import { TeamRepository } from './repositories/team.repository';

@Injectable()
export class SportOdRequestService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly teamRepo: TeamRepository,
    private readonly teamMemberRepo: TeamMemberRepository,
    private readonly odRequestRepo: SportOdRequestRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async requireActiveFaculty(actor: AuthenticatedUser): Promise<void> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE') {
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
    }
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateSportOdRequestDto,
  ): Promise<SportOdRequestRow> {
    await this.requireActiveFaculty(actor);

    const team = await this.teamRepo.findById(dto.teamId);
    if (!team) throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      team.sportId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);

    const roster = await this.teamMemberRepo.findActiveByTeam(dto.teamId);
    if (roster.length === 0) {
      throw new ForbiddenException(SPORTS_ERRORS.NO_ACTIVE_ROSTER);
    }

    return this.unitOfWork.run(async (client) => {
      const request = await this.odRequestRepo.create(
        {
          teamId: dto.teamId,
          sportId: team.sportId,
          fixtureId: dto.fixtureId ?? null,
          eventDate: dto.eventDate,
          reason: dto.reason,
          requestedBy: actor.personId,
        },
        client,
      );

      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'SPORTS_OD_REQUEST',
          subjectObjectType: 'sport_od_request',
          subjectObjectId: request.id,
          requestedBy: actor.personId,
          payload: {
            teamName: team.name,
            sportName: team.sportName,
            eventDate: dto.eventDate,
            reason: dto.reason,
            rosterSize: roster.length,
          },
        },
        client,
      );
      await this.odRequestRepo.linkApprovalRequest(
        request.id,
        approvalRequest.id,
        client,
      );

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FACULTY',
          action: 'SPORTS_OD_REQUEST_CREATED',
          objectType: 'sport_od_request',
          objectId: request.id,
          outcome: 'SUCCESS',
          afterData: { ...request, rosterSize: roster.length },
        },
        client,
      );

      return { ...request, approvalRequestId: approvalRequest.id };
    });
  }

  async list(actor: AuthenticatedUser): Promise<SportOdRequestRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.odRequestRepo.findBySportIds(sportIds);
  }

  async get(actor: AuthenticatedUser, id: string): Promise<SportOdRequestRow> {
    await this.requireActiveFaculty(actor);
    const request = await this.odRequestRepo.findById(id);
    if (!request)
      throw new NotFoundException(SPORTS_ERRORS.OD_REQUEST_NOT_FOUND);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      request.sportId,
    );
    if (!authorized)
      throw new NotFoundException(SPORTS_ERRORS.OD_REQUEST_NOT_FOUND);
    return request;
  }
}
