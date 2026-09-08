import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateCoachDto } from './dto/create-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { isCheckViolation, isForeignKeyViolation } from './pg-error.util';
import { CoachRepository } from './repositories/coach.repository';

@Injectable()
export class CoachesService {
  constructor(
    private readonly coachRepo: CoachRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.coachRepo.findMany();
  }

  async get(id: string) {
    const coach = await this.coachRepo.findById(id);
    if (!coach) throw new NotFoundException('Coach not found');
    return coach;
  }

  async create(dto: CreateCoachDto, actorPersonId: string) {
    try {
      const created = await this.coachRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'COACH_CREATED',
        objectType: 'coach',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      // Belt-and-braces: the DTO's @ValidateIf already catches a missing personId for
      // a non-external coach before this point, but the DB's own check constraint is
      // the final authority.
      if (isCheckViolation(err)) {
        throw new BadRequestException('An internal (non-external) coach must have a personId.');
      }
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException('personId does not refer to an existing person.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCoachDto, actorPersonId: string) {
    const existing = await this.get(id);
    const updated = await this.coachRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Coach not found');
    await this.auditService.record({
      actorPersonId,
      action: 'COACH_UPDATED',
      objectType: 'coach',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
