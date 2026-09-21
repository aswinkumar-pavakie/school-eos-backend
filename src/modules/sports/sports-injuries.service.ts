import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreateSportsInjuryDto } from './dto/create-sports-injury.dto';
import { UpdateSportsInjuryDto } from './dto/update-sports-injury.dto';
import { InjuryStatus, SportsInjuryRepository, SportsInjuryRow } from './repositories/sports-injury.repository';

@Injectable()
export class SportsInjuriesService {
  constructor(
    private readonly injuryRepo: SportsInjuryRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SportsInjuryRow[]> {
    return this.injuryRepo.findAll();
  }

  async create(actor: AuthenticatedUser, dto: CreateSportsInjuryDto): Promise<SportsInjuryRow> {
    const injury = await this.injuryRepo.create({
      studentId: dto.studentId,
      sportId: dto.sportId,
      title: dto.title,
      description: dto.description,
      incidentDate: dto.incidentDate,
      guardianInformed: dto.guardianInformed,
      createdBy: actor.personId,
    });
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_INJURY_LOGGED',
      objectType: 'sports_injury_incident',
      objectId: injury.id,
      outcome: 'SUCCESS',
      afterData: { studentId: dto.studentId, title: dto.title },
    });
    return injury;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateSportsInjuryDto): Promise<SportsInjuryRow> {
    const updated = await this.injuryRepo.updateStatus(
      id,
      {
        status: dto.status as InjuryStatus | undefined,
        guardianInformed: dto.guardianInformed,
        title: dto.title,
        description: dto.description,
        incidentDate: dto.incidentDate,
      },
      actor.personId,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_INJURY_UPDATED',
      objectType: 'sports_injury_incident',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return updated;
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.injuryRepo.delete(id);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_INJURY_DELETED',
      objectType: 'sports_injury_incident',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
