import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateCopyDto } from './dto/create-copy.dto';
import { UpdateCopyDto } from './dto/update-copy.dto';
import { LibraryFineAssessmentService } from './library-fine-assessment.service';
import { isUniqueViolation } from './pg-error.util';
import { LibraryBookCopyRepository } from './repositories/library-book-copy.repository';
import { LibraryBookRepository } from './repositories/library-book.repository';
import { LibraryIssueRepository } from './repositories/library-issue.repository';
import { LibraryLostDamagedReportRepository } from './repositories/library-lost-damaged-report.repository';

@Injectable()
export class BookCopiesService {
  constructor(
    private readonly copyRepo: LibraryBookCopyRepository,
    private readonly bookRepo: LibraryBookRepository,
    private readonly issueRepo: LibraryIssueRepository,
    private readonly fineAssessment: LibraryFineAssessmentService,
    private readonly lostDamagedReportRepo: LibraryLostDamagedReportRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async listForBook(bookId: string) {
    const book = await this.bookRepo.findById(bookId);
    if (!book) throw new NotFoundException('Book not found');
    return this.copyRepo.findByBookId(bookId);
  }

  async create(bookId: string, dto: CreateCopyDto, actorPersonId: string) {
    const book = await this.bookRepo.findById(bookId);
    if (!book) throw new NotFoundException('Book not found');
    try {
      const created = await this.copyRepo.create({ ...dto, bookId });
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_COPY_CREATED',
        objectType: 'library_book_copy',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A copy with this copy code already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateCopyDto, actorPersonId: string) {
    const existing = await this.copyRepo.findById(id);
    if (!existing) throw new NotFoundException('Copy not found');
    try {
      const updated = (await this.copyRepo.update(id, dto))!;
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_COPY_UPDATED',
        objectType: 'library_book_copy',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A copy with this copy code already exists.');
      throw err;
    }
  }

  private async markUnavailable(
    id: string,
    status: 'LOST' | 'DAMAGED',
    actorPersonId: string,
    reason?: string,
    notes?: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.copyRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Copy not found');
      if (locked.status === 'RETIRED') throw new ConflictException('This copy is retired -- its status can no longer change.');

      const activeIssue = await this.issueRepo.findActiveByCopyId(id, client);
      const updatedCopy = (await this.copyRepo.setStatus(id, status, client))!;

      let fine = null;
      if (activeIssue) {
        await this.issueRepo.markLost(activeIssue.id, client);
        fine = await this.fineAssessment.assessLossOrDamageFine(client, {
          issueId: activeIssue.id,
          memberId: activeIssue.memberId,
          reason: status,
          acquisitionCostPaise: locked.acquisitionCostPaise,
          assessedBy: actorPersonId,
        });
      }

      // The incident log entry -- reportable "who/why/notes" history, separate
      // from the copy's own single authoritative status (which just changed
      // above). Never a second status system, just a record of this event.
      await this.lostDamagedReportRepo.create(
        {
          copyId: id,
          issueId: activeIssue?.id ?? null,
          memberId: activeIssue?.memberId ?? null,
          type: status,
          reason: reason ?? null,
          notes: notes ?? null,
          fineId: fine?.id ?? null,
          reportedBy: actorPersonId,
        },
        client,
      );

      await this.auditService.record(
        {
          actorPersonId,
          action: status === 'LOST' ? 'LIBRARY_COPY_MARKED_LOST' : 'LIBRARY_COPY_MARKED_DAMAGED',
          objectType: 'library_book_copy',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: { ...updatedCopy, fineAssessed: fine ?? null, reason, notes },
        },
        client,
      );
      return { ...updatedCopy, fineAssessed: fine };
    });
  }

  markLost(id: string, actorPersonId: string, reason?: string, notes?: string) {
    return this.markUnavailable(id, 'LOST', actorPersonId, reason, notes);
  }

  markDamaged(id: string, actorPersonId: string, reason?: string, notes?: string) {
    return this.markUnavailable(id, 'DAMAGED', actorPersonId, reason, notes);
  }

  async withdraw(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.copyRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Copy not found');
      if (locked.status !== 'AVAILABLE') {
        throw new ConflictException(`This copy is currently ${locked.status.toLowerCase()} -- only an available copy can be withdrawn.`);
      }
      const updated = (await this.copyRepo.setStatus(id, 'RETIRED', client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_COPY_WITHDRAWN',
          objectType: 'library_book_copy',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  /** Temporary maintenance state -- not a loss, so no fine is assessed. Only
   * valid from AVAILABLE: a copy already out on loan must be returned first. */
  async markUnderRepair(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.copyRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Copy not found');
      if (locked.status !== 'AVAILABLE') {
        throw new ConflictException(`This copy is currently ${locked.status.toLowerCase()} -- only an available copy can be sent for repair.`);
      }
      const updated = (await this.copyRepo.setStatus(id, 'UNDER_REPAIR', client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_COPY_MARKED_UNDER_REPAIR',
          objectType: 'library_book_copy',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  /** Repair complete -- back into circulation. */
  async restore(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.copyRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Copy not found');
      if (locked.status !== 'UNDER_REPAIR') {
        throw new ConflictException(`This copy is currently ${locked.status.toLowerCase()} -- only a copy under repair can be restored.`);
      }
      const updated = (await this.copyRepo.setStatus(id, 'AVAILABLE', client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_COPY_RESTORED',
          objectType: 'library_book_copy',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: locked,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }
}
