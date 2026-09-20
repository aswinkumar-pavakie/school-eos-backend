import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreateSubstituteCoachDto } from './dto/create-substitute-coach.dto';
import { UpdateSubstituteCoachDto } from './dto/update-substitute-coach.dto';
import {
  SportsSubstituteCoachRepository,
  SubstituteCoachRow,
  SubstituteCoachStatus,
} from './repositories/sports-substitute-coach.repository';

@Injectable()
export class SportsSubstituteCoachesService {
  constructor(
    private readonly repo: SportsSubstituteCoachRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SubstituteCoachRow[]> {
    return this.repo.findAll();
  }

  async create(actor: AuthenticatedUser, dto: CreateSubstituteCoachDto): Promise<SubstituteCoachRow> {
    const row = await this.repo.create({
      teamId: dto.teamId,
      originalCoachId: dto.originalCoachId,
      substituteCoachId: dto.substituteCoachId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
      createdBy: actor.personId,
    });
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_SUBSTITUTE_COACH_CREATED',
      objectType: 'sports_substitute_coach',
      objectId: row.id,
      outcome: 'SUCCESS',
      afterData: { teamId: dto.teamId, substituteCoachId: dto.substituteCoachId },
    });
    return row;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateSubstituteCoachDto): Promise<SubstituteCoachRow> {
    const updated = await this.repo.update(
      id,
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason,
        status: dto.status as SubstituteCoachStatus | undefined,
      },
      actor.personId,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_SUBSTITUTE_COACH_UPDATED',
      objectType: 'sports_substitute_coach',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return updated;
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.repo.delete(id);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_SUBSTITUTE_COACH_DELETED',
      objectType: 'sports_substitute_coach',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
