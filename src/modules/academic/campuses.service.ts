import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CampusRepository } from './repositories/campus.repository';
import { CreateCampusDto } from './dto/create-campus.dto';
import { UpdateCampusDto } from './dto/update-campus.dto';
import { isUniqueViolation } from './pg-error.util';

@Injectable()
export class CampusesService {
  constructor(
    private readonly campusRepo: CampusRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.campusRepo.findMany();
  }

  async get(id: string) {
    const campus = await this.campusRepo.findById(id);
    if (!campus) throw new NotFoundException('Campus not found');
    return campus;
  }

  async create(dto: CreateCampusDto, actorPersonId: string) {
    try {
      const created = await this.campusRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'CAMPUS_CREATED',
        objectType: 'campus',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException('A campus with this code already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateCampusDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.campusRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Campus not found');
      await this.auditService.record({
        actorPersonId,
        action: 'CAMPUS_UPDATED',
        objectType: 'campus',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException('A campus with this code already exists.');
      throw err;
    }
  }

  async setPrimary(id: string, actorPersonId: string) {
    await this.get(id);
    return this.unitOfWork.run(async (client) => {
      await this.campusRepo.clearPrimary(client);
      const updated = await this.campusRepo.setPrimary(id, client);
      if (!updated) throw new NotFoundException('Campus not found');
      await this.auditService.record(
        {
          actorPersonId,
          action: 'CAMPUS_SET_PRIMARY',
          objectType: 'campus',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }
}
