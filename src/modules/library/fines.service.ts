import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { MiscReceivablesService } from '../finance/misc-receivables/misc-receivables.service';
import { FineQueryDto } from './dto/fine-query.dto';
import { WaiveFineDto } from './dto/waive-fine.dto';
import { LibraryFineRepository } from './repositories/library-fine.repository';

@Injectable()
export class FinesService {
  constructor(
    private readonly fineRepo: LibraryFineRepository,
    private readonly receivablesService: MiscReceivablesService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: FineQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.fineRepo.findMany({
      status: query.status,
      memberId: query.memberId,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const fine = await this.fineRepo.findById(id);
    if (!fine) throw new NotFoundException('Fine not found');
    return fine;
  }

  async sendToFinance(id: string, actorPersonId: string) {
    const fine = await this.fineRepo.findById(id);
    if (!fine) throw new NotFoundException('Fine not found');
    if (fine.status !== 'PENDING')
      throw new ConflictException(
        'Only a pending fine can be sent to Finance.',
      );

    const receivable = await this.receivablesService.create({
      sourceModule: 'LIBRARY',
      sourceReferenceId: fine.id,
      personId: fine.memberPersonId,
      description: `Library fine -- ${fine.reason.toLowerCase()} -- ${fine.bookTitle}`,
      amountPaise: fine.amountPaise,
    });

    const updated = (await this.fineRepo.setSentToFinance(id, receivable.id))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_FINE_SENT_TO_FINANCE',
      objectType: 'library_fine',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: fine,
      afterData: { ...updated, financeReceivableId: receivable.id },
    });
    return updated;
  }

  async refreshStatus(id: string, actorPersonId: string) {
    const fine = await this.fineRepo.findById(id);
    if (!fine) throw new NotFoundException('Fine not found');
    if (!fine.financeReceivableId) {
      throw new ConflictException(
        'This fine has not been sent to Finance yet -- nothing to refresh.',
      );
    }
    const receivable = await this.receivablesService.get(
      fine.financeReceivableId,
    );
    const nextStatus =
      receivable.status === 'PAID'
        ? 'PAID'
        : receivable.status === 'PARTIAL'
          ? 'PARTIALLY_PAID'
          : receivable.status === 'WAIVED' || receivable.status === 'CANCELLED'
            ? receivable.status
            : 'SENT_TO_FINANCE';

    if (nextStatus === fine.status) return fine;

    const updated = (await this.fineRepo.setStatus(id, nextStatus))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_FINE_STATUS_REFRESHED',
      objectType: 'library_fine',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: fine,
      afterData: updated,
    });
    return updated;
  }

  async waive(id: string, dto: WaiveFineDto, actorPersonId: string) {
    const fine = await this.fineRepo.findById(id);
    if (!fine) throw new NotFoundException('Fine not found');
    if (fine.status !== 'PENDING') {
      throw new ConflictException(
        'This fine has already been sent to Finance -- waive it there instead.',
      );
    }
    const updated = (await this.fineRepo.waive(id, {
      waivedBy: actorPersonId,
      waivedReason: dto.reason,
    }))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_FINE_WAIVED',
      objectType: 'library_fine',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: fine,
      afterData: updated,
    });
    return updated;
  }
}
