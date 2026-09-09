import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AttendantRepository } from './repositories/attendant.repository';
import { CreateAttendantDto } from './dto/create-attendant.dto';
import { UpdateAttendantDto } from './dto/update-attendant.dto';
import { isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class AttendantsService {
  constructor(
    private readonly attendantRepo: AttendantRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.attendantRepo.findMany();
  }

  async get(id: string) {
    const attendant = await this.attendantRepo.findById(id);
    if (!attendant) throw new NotFoundException('Attendant not found');
    return attendant;
  }

  async create(dto: CreateAttendantDto, actorPersonId: string) {
    try {
      const created = await this.attendantRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'ATTENDANT_CREATED',
        objectType: 'attendant',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('personId does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateAttendantDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.attendantRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Attendant not found');
      await this.auditService.record({
        actorPersonId,
        action: 'ATTENDANT_UPDATED',
        objectType: 'attendant',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('personId does not exist.');
      throw err;
    }
  }
}
