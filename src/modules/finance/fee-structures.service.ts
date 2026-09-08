import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { CreateFeeStructureLineDto } from './dto/create-fee-structure-line.dto';
import { FeeStructureQueryDto } from './dto/fee-structure-query.dto';
import { UpdateFeeStructureDto } from './dto/update-fee-structure.dto';
import { UpdateFeeStructureLineDto } from './dto/update-fee-structure-line.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { FeeStructureLineRepository } from './repositories/fee-structure-line.repository';
import { FeeStructureRepository } from './repositories/fee-structure.repository';

@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly feeStructureLineRepo: FeeStructureLineRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  list(query: FeeStructureQueryDto) {
    return this.feeStructureRepo.findMany(query);
  }

  async get(id: string) {
    const structure = await this.feeStructureRepo.findById(id);
    if (!structure) throw new NotFoundException('Fee structure not found');
    const lines = await this.feeStructureLineRepo.findByStructureId(id);
    return { ...structure, lines };
  }

  async create(dto: CreateFeeStructureDto, actorPersonId: string) {
    try {
      const structure = await this.feeStructureRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'FEE_STRUCTURE_CREATED',
        objectType: 'fee_structure',
        objectId: structure.id,
        outcome: 'SUCCESS',
        afterData: structure,
      });
      return { ...structure, lines: [] };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A fee structure for this academic year, grade, medium, and category already exists.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'academicYearId, gradeId, or mediumId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  private async getDraftOrThrow(id: string) {
    const structure = await this.feeStructureRepo.findById(id);
    if (!structure) throw new NotFoundException('Fee structure not found');
    if (structure.state !== 'DRAFT') {
      throw new ConflictException(
        'This fee structure can only be edited while in DRAFT state.',
      );
    }
    return structure;
  }

  async update(id: string, dto: UpdateFeeStructureDto, actorPersonId: string) {
    const existing = await this.getDraftOrThrow(id);
    try {
      const updated = await this.feeStructureRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Fee structure not found');
      await this.auditService.record({
        actorPersonId,
        action: 'FEE_STRUCTURE_UPDATED',
        objectType: 'fee_structure',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      const lines = await this.feeStructureLineRepo.findByStructureId(id);
      return { ...updated, lines };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A fee structure for this academic year, grade, medium, and category already exists.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'academicYearId, gradeId, or mediumId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  async publish(id: string, actorPersonId: string) {
    const structure = await this.feeStructureRepo.findById(id);
    if (!structure) throw new NotFoundException('Fee structure not found');
    if (structure.state !== 'DRAFT') {
      throw new ConflictException(
        'Only a DRAFT fee structure can be published.',
      );
    }
    const updated = await this.feeStructureRepo.setState(id, 'ACTIVE');
    await this.auditService.record({
      actorPersonId,
      action: 'FEE_STRUCTURE_PUBLISHED',
      objectType: 'fee_structure',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    const lines = await this.feeStructureLineRepo.findByStructureId(id);
    return { ...updated, lines };
  }

  async supersede(id: string, actorPersonId: string) {
    const structure = await this.feeStructureRepo.findById(id);
    if (!structure) throw new NotFoundException('Fee structure not found');
    if (structure.state !== 'ACTIVE') {
      throw new ConflictException(
        'Only an ACTIVE fee structure can be superseded.',
      );
    }
    const updated = await this.feeStructureRepo.setState(id, 'SUPERSEDED');
    await this.auditService.record({
      actorPersonId,
      action: 'FEE_STRUCTURE_SUPERSEDED',
      objectType: 'fee_structure',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    const lines = await this.feeStructureLineRepo.findByStructureId(id);
    return { ...updated, lines };
  }

  async listLines(feeStructureId: string) {
    await this.get(feeStructureId);
    return this.feeStructureLineRepo.findByStructureId(feeStructureId);
  }

  async createLine(
    feeStructureId: string,
    dto: CreateFeeStructureLineDto,
    actorPersonId: string,
  ) {
    await this.getDraftOrThrow(feeStructureId);
    try {
      return await this.unitOfWork.run(async (client) => {
        const line = await this.feeStructureLineRepo.create(
          feeStructureId,
          dto,
          client,
        );
        await this.feeStructureRepo.recomputeTotal(feeStructureId, client);
        await this.auditService.record(
          {
            actorPersonId,
            action: 'FEE_STRUCTURE_LINE_CREATED',
            objectType: 'fee_structure_line',
            objectId: line.id,
            outcome: 'SUCCESS',
            afterData: line,
          },
          client,
        );
        return line;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A line for this fee head and instalment number already exists on this structure.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'feeHeadId does not refer to an existing fee head.',
        );
      }
      throw err;
    }
  }

  private async getLineOrThrow(lineId: string) {
    const line = await this.feeStructureLineRepo.findById(lineId);
    if (!line) throw new NotFoundException('Fee structure line not found');
    return line;
  }

  async updateLine(
    lineId: string,
    dto: UpdateFeeStructureLineDto,
    actorPersonId: string,
  ) {
    const line = await this.getLineOrThrow(lineId);
    await this.getDraftOrThrow(line.feeStructureId);
    return this.unitOfWork.run(async (client) => {
      const updated = await this.feeStructureLineRepo.update(
        lineId,
        dto,
        client,
      );
      await this.feeStructureRepo.recomputeTotal(line.feeStructureId, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'FEE_STRUCTURE_LINE_UPDATED',
          objectType: 'fee_structure_line',
          objectId: lineId,
          outcome: 'SUCCESS',
          beforeData: line,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  async deleteLine(lineId: string, actorPersonId: string) {
    const line = await this.getLineOrThrow(lineId);
    await this.getDraftOrThrow(line.feeStructureId);
    return this.unitOfWork.run(async (client) => {
      const deleted = await this.feeStructureLineRepo.delete(lineId, client);
      await this.feeStructureRepo.recomputeTotal(line.feeStructureId, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'FEE_STRUCTURE_LINE_DELETED',
          objectType: 'fee_structure_line',
          objectId: lineId,
          outcome: 'SUCCESS',
        },
        client,
      );
      return { deleted };
    });
  }
}
