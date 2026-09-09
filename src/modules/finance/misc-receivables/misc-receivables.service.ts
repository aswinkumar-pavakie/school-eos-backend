// Generic, Finance-owned receivable -- for any one-off, non-tuition charge a
// module other than Finance needs collected (Library fines today; a damaged
// hostel bed or lost ID card could reuse it later). fee_demand/payment can't
// represent this: fee_demand requires a student_fee_assignment (a full tuition
// plan) and only ever references a student, never staff. Library only ever
// calls create()/get() (to read status back); only Finance ever calls
// collectPayment().

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { isCheckViolation, isUniqueViolation } from '../pg-error.util';
import { MiscReceivableRepository } from './repositories/misc-receivable.repository';

export interface CreateReceivableInput {
  sourceModule: string;
  sourceReferenceId: string;
  personId: string;
  description: string;
  amountPaise: number | string;
}

export interface ListReceivablesQuery {
  status?: string;
  sourceModule?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MiscReceivablesService {
  constructor(
    private readonly receivableRepo: MiscReceivableRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListReceivablesQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.receivableRepo.findMany({
      status: query.status,
      sourceModule: query.sourceModule,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const receivable = await this.receivableRepo.findById(id);
    if (!receivable) throw new NotFoundException('Receivable not found');
    return receivable;
  }

  /** Called by other modules (e.g. Library) to raise a charge for Finance to
   * collect -- never by an HTTP request directly. */
  async create(input: CreateReceivableInput) {
    return this.receivableRepo.create(input);
  }

  async collectPayment(
    id: string,
    dto: CollectPaymentDto,
    actorPersonId: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.receivableRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Receivable not found');
      if (locked.status === 'PAID')
        throw new ConflictException('This receivable is already fully paid.');
      if (locked.status === 'WAIVED' || locked.status === 'CANCELLED') {
        throw new ConflictException(
          `This receivable is ${locked.status.toLowerCase()} -- no further payment can be collected.`,
        );
      }

      try {
        await this.receivableRepo.recordPayment(
          id,
          {
            amountPaise: dto.amountPaise,
            mode: dto.mode,
            collectedBy: actorPersonId,
            idempotencyKey: dto.idempotencyKey,
          },
          client,
        );
        const updated = await this.receivableRepo.applyPayment(
          id,
          dto.amountPaise,
          client,
        );
        await this.auditService.record(
          {
            actorPersonId,
            action: 'MISC_RECEIVABLE_PAYMENT_COLLECTED',
            objectType: 'finance_misc_receivable',
            objectId: id,
            outcome: 'SUCCESS',
            beforeData: locked,
            afterData: {
              ...updated,
              amountCollectedPaise: dto.amountPaise,
              mode: dto.mode,
            },
          },
          client,
        );
        return updated;
      } catch (err) {
        if (isUniqueViolation(err))
          throw new ConflictException('This payment was already recorded.');
        if (isCheckViolation(err))
          throw new BadRequestException(
            'This payment would exceed the outstanding amount.',
          );
        throw err;
      }
    });
  }
}
