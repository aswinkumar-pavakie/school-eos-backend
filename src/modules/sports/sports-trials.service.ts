import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreateSportsTrialDto } from './dto/create-sports-trial.dto';
import { UpdateSportsTrialDto } from './dto/update-sports-trial.dto';
import {
  SportsTrialRepository,
  SportsTrialRow,
  TrialRound,
  TrialStatus,
} from './repositories/sports-trial.repository';

@Injectable()
export class SportsTrialsService {
  constructor(
    private readonly trialRepo: SportsTrialRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SportsTrialRow[]> {
    return this.trialRepo.findAll();
  }

  async create(actor: AuthenticatedUser, dto: CreateSportsTrialDto): Promise<SportsTrialRow> {
    const trial = await this.trialRepo.create(
      {
        studentId: dto.studentId,
        sportId: dto.sportId,
        round: dto.round as TrialRound,
        trialDate: dto.trialDate,
        score: dto.score,
        notes: dto.notes,
        createdBy: actor.personId,
      },
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_TRIAL_CREATED',
      objectType: 'sports_trial',
      objectId: trial.id,
      outcome: 'SUCCESS',
      afterData: { studentId: dto.studentId, sportId: dto.sportId, round: dto.round },
    });
    return trial;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateSportsTrialDto): Promise<SportsTrialRow> {
    const updated = await this.trialRepo.updateStatusAndScore(
      id,
      {
        status: dto.status as TrialStatus | undefined,
        score: dto.score,
        notes: dto.notes,
        round: dto.round as TrialRound | undefined,
        trialDate: dto.trialDate,
      },
      actor.personId,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_TRIAL_UPDATED',
      objectType: 'sports_trial',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return updated;
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.trialRepo.delete(id);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_TRIAL_DELETED',
      objectType: 'sports_trial',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
