import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateFeeHeadDto } from './dto/create-fee-head.dto';
import { UpdateFeeHeadDto } from './dto/update-fee-head.dto';
import { isUniqueViolation } from './pg-error.util';
import { FeeHeadRepository } from './repositories/fee-head.repository';

@Injectable()
export class FeeHeadsService {
  constructor(
    private readonly feeHeadRepo: FeeHeadRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.feeHeadRepo.findMany();
  }

  async get(id: string) {
    const feeHead = await this.feeHeadRepo.findById(id);
    if (!feeHead) throw new NotFoundException('Fee head not found');
    return feeHead;
  }

  async create(dto: CreateFeeHeadDto, actorPersonId: string) {
    try {
      const created = await this.feeHeadRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'FEE_HEAD_CREATED',
        objectType: 'fee_head',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A fee head with this code already exists.',
        );
      throw err;
    }
  }

  async update(id: string, dto: UpdateFeeHeadDto, actorPersonId: string) {
    const existing = await this.get(id);
    const updated = await this.feeHeadRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Fee head not found');
    await this.auditService.record({
      actorPersonId,
      action: 'FEE_HEAD_UPDATED',
      objectType: 'fee_head',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
