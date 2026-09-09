import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { GradeScaleRepository } from './repositories/grade-scale.repository';
import { CreateGradeScaleDto } from './dto/create-grade-scale.dto';
import { UpdateGradeScaleDto } from './dto/update-grade-scale.dto';
import { CreateGradeBandDto } from './dto/create-grade-band.dto';
import { UpdateGradeBandDto } from './dto/update-grade-band.dto';
import { isCheckViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class GradeScalesService {
  constructor(
    private readonly gradeScaleRepo: GradeScaleRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.gradeScaleRepo.findMany();
  }

  async get(id: string) {
    const scale = await this.gradeScaleRepo.findById(id);
    if (!scale) throw new NotFoundException('Grade scale not found');
    return scale;
  }

  async create(dto: CreateGradeScaleDto, actorPersonId: string) {
    try {
      const created = await this.gradeScaleRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'GRADE_SCALE_CREATED',
        objectType: 'grade_scale',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A grade scale with this name already exists.',
        );
      throw err;
    }
  }

  async update(id: string, dto: UpdateGradeScaleDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.gradeScaleRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Grade scale not found');
      await this.auditService.record({
        actorPersonId,
        action: 'GRADE_SCALE_UPDATED',
        objectType: 'grade_scale',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A grade scale with this name already exists.',
        );
      throw err;
    }
  }

  async setDefault(id: string, actorPersonId: string) {
    await this.get(id);
    return this.unitOfWork.run(async (client) => {
      await this.gradeScaleRepo.clearDefault(client);
      const updated = await this.gradeScaleRepo.setDefault(id, client);
      if (!updated) throw new NotFoundException('Grade scale not found');
      await this.auditService.record(
        {
          actorPersonId,
          action: 'GRADE_SCALE_SET_DEFAULT',
          objectType: 'grade_scale',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  async listBands(gradeScaleId: string) {
    await this.get(gradeScaleId);
    return this.gradeScaleRepo.findBands(gradeScaleId);
  }

  async createBand(
    gradeScaleId: string,
    dto: CreateGradeBandDto,
    actorPersonId: string,
  ) {
    await this.get(gradeScaleId);
    if (dto.maxPercent < dto.minPercent) {
      throw new BadRequestException(
        'maxPercent must be greater than or equal to minPercent.',
      );
    }
    try {
      const created = await this.gradeScaleRepo.createBand(gradeScaleId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'GRADE_BAND_CREATED',
        objectType: 'grade_band',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A band with this label already exists on this scale.',
        );
      if (isCheckViolation(err))
        throw new BadRequestException(
          'maxPercent must be greater than or equal to minPercent, and both within 0-100.',
        );
      throw err;
    }
  }

  async updateBand(
    bandId: string,
    dto: UpdateGradeBandDto,
    actorPersonId: string,
  ) {
    const existing = await this.gradeScaleRepo.findBandById(bandId);
    if (!existing) throw new NotFoundException('Grade band not found');

    const nextMin = dto.minPercent ?? Number(existing.minPercent);
    const nextMax = dto.maxPercent ?? Number(existing.maxPercent);
    if (nextMax < nextMin) {
      throw new BadRequestException(
        'maxPercent must be greater than or equal to minPercent.',
      );
    }

    try {
      const updated = await this.gradeScaleRepo.updateBand(bandId, dto);
      if (!updated) throw new NotFoundException('Grade band not found');
      await this.auditService.record({
        actorPersonId,
        action: 'GRADE_BAND_UPDATED',
        objectType: 'grade_band',
        objectId: bandId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A band with this label already exists on this scale.',
        );
      if (isCheckViolation(err))
        throw new BadRequestException(
          'maxPercent must be greater than or equal to minPercent, and both within 0-100.',
        );
      throw err;
    }
  }

  async deleteBand(bandId: string, actorPersonId: string) {
    const deleted = await this.gradeScaleRepo.deleteBand(bandId);
    if (!deleted) throw new NotFoundException('Grade band not found');
    await this.auditService.record({
      actorPersonId,
      action: 'GRADE_BAND_DELETED',
      objectType: 'grade_band',
      objectId: bandId,
      outcome: 'SUCCESS',
    });
  }
}
