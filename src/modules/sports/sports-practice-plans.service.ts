import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreatePracticePlanDto } from './dto/create-practice-plan.dto';
import { UpdatePracticePlanDto } from './dto/update-practice-plan.dto';
import {
  PracticePlanRow,
  PracticePlanStatus,
  SportsPracticePlanRepository,
  WeeklyFocus,
} from './repositories/sports-practice-plan.repository';

@Injectable()
export class SportsPracticePlansService {
  constructor(
    private readonly repo: SportsPracticePlanRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PracticePlanRow[]> {
    return this.repo.findAll();
  }

  async create(actor: AuthenticatedUser, dto: CreatePracticePlanDto): Promise<PracticePlanRow> {
    const plan = await this.repo.create({
      teamId: dto.teamId,
      title: dto.title,
      startDate: dto.startDate,
      endDate: dto.endDate,
      weeklyFocus: dto.weeklyFocus as WeeklyFocus | undefined,
      createdBy: actor.personId,
    });
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_PRACTICE_PLAN_CREATED',
      objectType: 'sports_practice_plan',
      objectId: plan.id,
      outcome: 'SUCCESS',
      afterData: { teamId: dto.teamId, title: dto.title },
    });
    return plan;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdatePracticePlanDto): Promise<PracticePlanRow> {
    const updated = await this.repo.update(
      id,
      {
        title: dto.title,
        startDate: dto.startDate,
        endDate: dto.endDate,
        weeklyFocus: dto.weeklyFocus as WeeklyFocus | undefined,
        status: dto.status as PracticePlanStatus | undefined,
      },
      actor.personId,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_PRACTICE_PLAN_UPDATED',
      objectType: 'sports_practice_plan',
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
      action: 'SPORTS_PRACTICE_PLAN_DELETED',
      objectType: 'sports_practice_plan',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
