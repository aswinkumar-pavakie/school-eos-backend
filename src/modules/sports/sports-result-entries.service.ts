import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreateResultEntryDto } from './dto/create-result-entry.dto';
import { UpdateResultEntryDto } from './dto/update-result-entry.dto';
import {
  ResultEntryRow,
  ResultEntryStatus,
  SportsResultEntryRepository,
} from './repositories/sports-result-entry.repository';

@Injectable()
export class SportsResultEntriesService {
  constructor(
    private readonly repo: SportsResultEntryRepository,
    private readonly audit: AuditService,
  ) {}

  async list(status?: ResultEntryStatus): Promise<ResultEntryRow[]> {
    return this.repo.findAll(status);
  }

  async create(actor: AuthenticatedUser, dto: CreateResultEntryDto): Promise<ResultEntryRow> {
    const entry = await this.repo.create({
      studentId: dto.studentId,
      sportId: dto.sportId,
      tournamentId: dto.tournamentId,
      eventName: dto.eventName,
      resultValue: dto.resultValue,
      position: dto.position,
      createdBy: actor.personId,
    });
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_RESULT_ENTRY_CREATED',
      objectType: 'sports_result_entry',
      objectId: entry.id,
      outcome: 'SUCCESS',
      afterData: { studentId: dto.studentId, sportId: dto.sportId, eventName: dto.eventName },
    });
    return entry;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateResultEntryDto): Promise<ResultEntryRow> {
    const updated = await this.repo.update(
      id,
      {
        eventName: dto.eventName,
        resultValue: dto.resultValue,
        position: dto.position,
        status: dto.status as ResultEntryStatus | undefined,
      },
      actor.personId,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_RESULT_ENTRY_UPDATED',
      objectType: 'sports_result_entry',
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
      action: 'SPORTS_RESULT_ENTRY_DELETED',
      objectType: 'sports_result_entry',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
