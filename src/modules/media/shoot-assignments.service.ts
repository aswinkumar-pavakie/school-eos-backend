import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateShootAssignmentDto } from './dto/create-shoot-assignment.dto';
import { UpdateShootAssignmentDto } from './dto/update-shoot-assignment.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { ShootAssignmentRepository } from './repositories/shoot-assignment.repository';

@Injectable()
export class ShootAssignmentsService {
  constructor(
    private readonly repo: ShootAssignmentRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  list(filter: { status?: string; from?: string; to?: string }) {
    return this.repo.list(filter);
  }

  async get(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Shoot assignment not found');
    return row;
  }

  async create(dto: CreateShootAssignmentDto, actorPersonId: string) {
    try {
      const id = await this.unitOfWork.run((client) =>
        this.repo.create(
          {
            eventTitle: dto.eventTitle,
            venue: dto.venue,
            scheduledAt: dto.scheduledAt,
            outputType: dto.outputType,
            notes: dto.notes,
            createdBy: actorPersonId,
            crewIds: dto.crewIds ?? [],
            gearIds: dto.gearIds ?? [],
          },
          client,
        ),
      );
      const created = await this.get(id);
      await this.audit.record({
        actorPersonId,
        actorRoleCode: 'MEDIA_ROOM',
        action: 'SHOOT_ASSIGNMENT_CREATED',
        objectType: 'shoot_assignment',
        objectId: id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new BadRequestException('One of the crew members or gear items named does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateShootAssignmentDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      await this.unitOfWork.run((client) => this.repo.update(id, dto, client));
      const updated = await this.get(id);
      await this.audit.record({
        actorPersonId,
        actorRoleCode: 'MEDIA_ROOM',
        action: 'SHOOT_ASSIGNMENT_UPDATED',
        objectType: 'shoot_assignment',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new BadRequestException('One of the crew members or gear items named does not exist.');
      throw err;
    }
  }

  countToday() {
    return this.repo.countToday();
  }
}
