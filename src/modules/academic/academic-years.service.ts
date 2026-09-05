import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { AcademicYearRepository } from './repositories/academic-year.repository';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { isCheckViolation } from './pg-error.util';

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly academicYearRepo: AcademicYearRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.academicYearRepo.findMany();
  }

  async get(id: string) {
    const year = await this.academicYearRepo.findById(id);
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  async create(dto: CreateAcademicYearDto, actorPersonId: string) {
    try {
      const created = await this.academicYearRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'ACADEMIC_YEAR_CREATED',
        objectType: 'academic_year',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException('end_date must be after start_date.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAcademicYearDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.academicYearRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Academic year not found');
      await this.auditService.record({
        actorPersonId,
        action: 'ACADEMIC_YEAR_UPDATED',
        objectType: 'academic_year',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException('end_date must be after start_date.');
      }
      throw err;
    }
  }

  /** Atomic: clears any existing current year, then sets the target -- both inside one
   * transaction so the single-current partial-unique index never sees two true rows. */
  async setCurrent(id: string, actorPersonId: string) {
    await this.get(id);
    return this.unitOfWork.run(async (client) => {
      await this.academicYearRepo.clearCurrent(client);
      const updated = await this.academicYearRepo.setCurrent(id, client);
      if (!updated) throw new NotFoundException('Academic year not found');
      await this.auditService.record(
        {
          actorPersonId,
          action: 'ACADEMIC_YEAR_SET_CURRENT',
          objectType: 'academic_year',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  async close(id: string, actorPersonId: string) {
    const year = await this.get(id);
    if (year.status === 'CLOSED' || year.status === 'ARCHIVED') {
      throw new BadRequestException('Academic year is already closed.');
    }
    const updated = await this.academicYearRepo.close(id);
    if (!updated) throw new NotFoundException('Academic year not found');
    await this.auditService.record({
      actorPersonId,
      action: 'ACADEMIC_YEAR_CLOSED',
      objectType: 'academic_year',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }
}
