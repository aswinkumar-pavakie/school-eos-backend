import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreateSelectionWindowDto } from './dto/create-selection-window.dto';
import { UpdateSelectionWindowDto } from './dto/update-selection-window.dto';
import {
  SelectionWindowRow,
  SelectionWindowStatus,
  SportsSelectionWindowRepository,
} from './repositories/sports-selection-window.repository';

@Injectable()
export class SportsSelectionWindowsService {
  constructor(
    private readonly repo: SportsSelectionWindowRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SelectionWindowRow[]> {
    return this.repo.findAll();
  }

  async create(actor: AuthenticatedUser, dto: CreateSelectionWindowDto): Promise<SelectionWindowRow> {
    const window = await this.repo.create({
      sportId: dto.sportId,
      title: dto.title,
      opensOn: dto.opensOn,
      closesOn: dto.closesOn,
      notes: dto.notes,
      createdBy: actor.personId,
    });
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_SELECTION_WINDOW_CREATED',
      objectType: 'sports_selection_window',
      objectId: window.id,
      outcome: 'SUCCESS',
      afterData: { sportId: dto.sportId, title: dto.title },
    });
    return window;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateSelectionWindowDto): Promise<SelectionWindowRow> {
    const updated = await this.repo.update(
      id,
      {
        title: dto.title,
        opensOn: dto.opensOn,
        closesOn: dto.closesOn,
        notes: dto.notes,
        status: dto.status as SelectionWindowStatus | undefined,
      },
      actor.personId,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'SPORTS_ADMIN',
      action: 'SPORTS_SELECTION_WINDOW_UPDATED',
      objectType: 'sports_selection_window',
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
      action: 'SPORTS_SELECTION_WINDOW_DELETED',
      objectType: 'sports_selection_window',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
