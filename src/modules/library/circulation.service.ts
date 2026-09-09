import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssueQueryDto } from './dto/issue-query.dto';
import { LibraryFineAssessmentService } from './library-fine-assessment.service';
import { LibraryBookCopyRepository } from './repositories/library-book-copy.repository';
import { LibraryConfigRepository } from './repositories/library-config.repository';
import { LibraryFineRepository } from './repositories/library-fine.repository';
import { LibraryIssueRepository } from './repositories/library-issue.repository';
import { LibraryLostDamagedReportRepository } from './repositories/library-lost-damaged-report.repository';
import { LibraryMemberRepository } from './repositories/library-member.repository';
import { LibraryReservationRepository } from './repositories/library-reservation.repository';
import { ReservationsService } from './reservations.service';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class CirculationService {
  constructor(
    private readonly issueRepo: LibraryIssueRepository,
    private readonly copyRepo: LibraryBookCopyRepository,
    private readonly memberRepo: LibraryMemberRepository,
    private readonly reservationRepo: LibraryReservationRepository,
    private readonly fineRepo: LibraryFineRepository,
    private readonly configRepo: LibraryConfigRepository,
    private readonly fineAssessment: LibraryFineAssessmentService,
    private readonly reservationsService: ReservationsService,
    private readonly lostDamagedReportRepo: LibraryLostDamagedReportRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async list(query: IssueQueryDto) {
    await this.issueRepo.flipOverdueRows();
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.issueRepo.findMany({
      status: query.status,
      search: query.search,
      memberId: query.memberId,
      overdueOnly: query.overdueOnly,
      startDate: query.startDate,
      endDate: query.endDate,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    await this.issueRepo.flipOverdueRows();
    const issue = await this.issueRepo.findById(id);
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  async issue(dto: CreateIssueDto, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const copy = await this.copyRepo.findByIdForUpdate(dto.copyId, client);
      if (!copy) throw new NotFoundException('Copy not found');

      let readyReservationToFulfil: { id: string } | null = null;
      if (copy.status === 'RESERVED') {
        // Held for whoever's reservation is READY on this book -- only that
        // member can be issued this specific copy right now.
        const ready = await this.reservationRepo.findReadyForBook(
          copy.bookId,
          client,
        );
        if (!ready || ready.memberId !== dto.memberId) {
          throw new ConflictException(
            "This copy is held for another member's reservation -- it can't be issued to anyone else.",
          );
        }
        readyReservationToFulfil = { id: ready.id };
      } else if (copy.status !== 'AVAILABLE') {
        throw new ConflictException(
          `This copy is currently ${copy.status.toLowerCase()}, not available -- it can't be issued.`,
        );
      }

      const member = await this.memberRepo.findByIdForUpdate(
        dto.memberId,
        client,
      );
      if (!member) throw new NotFoundException('Member not found');
      if (member.status !== 'ACTIVE') {
        throw new BadRequestException(
          `This member is ${member.status.toLowerCase()} -- they can't be issued a book.`,
        );
      }

      const activeCount = await this.memberRepo.countActiveIssues(
        dto.memberId,
        client,
      );
      if (activeCount >= member.maxBooksAllowed) {
        throw new ConflictException(
          `This member already has ${activeCount} book(s) out, at their limit of ${member.maxBooksAllowed}.`,
        );
      }

      const config = await this.configRepo.get(client);
      const dueDate = addDays(today(), config.loanPeriodDays);

      const created = await this.issueRepo.create(
        {
          copyId: dto.copyId,
          memberId: dto.memberId,
          issuedBy: actorPersonId,
          dueDate,
        },
        client,
      );
      await this.copyRepo.setStatus(dto.copyId, 'ISSUED', client);

      // If this copy was being held for this exact member's READY reservation,
      // this issue is what fulfils it. A merely-PENDING reservation (not yet
      // this member's turn) never auto-fulfils just because they happened to
      // be issued a different, unheld copy of the same book.
      if (readyReservationToFulfil) {
        await this.reservationRepo.setStatus(
          readyReservationToFulfil.id,
          'FULFILLED',
          created.id,
          client,
        );
      }

      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_ISSUE_CREATED',
          objectType: 'library_issue',
          objectId: created.id,
          outcome: 'SUCCESS',
          afterData: created,
        },
        client,
      );
      return created;
    });
  }

  async returnBook(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const issue = await this.issueRepo.findByIdForUpdate(id, client);
      if (!issue) throw new NotFoundException('Issue not found');
      if (issue.status !== 'ISSUED' && issue.status !== 'OVERDUE') {
        throw new ConflictException('This book is not currently out on loan.');
      }
      const copy = await this.copyRepo.findByIdForUpdate(issue.copyId, client);
      if (!copy) throw new NotFoundException('Copy not found');

      const daysOverdue = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(`${issue.dueDate}T00:00:00Z`).getTime()) /
            86400000,
        ),
      );

      const updated = (await this.issueRepo.markReturned(
        id,
        actorPersonId,
        client,
      ))!;
      // Holds the copy for the next PENDING reservation in the queue (flips it
      // to RESERVED and that reservation to READY) if one exists for this
      // book; otherwise frees it straight to AVAILABLE, same as before.
      await this.reservationsService.releaseOrPromoteHold(
        copy.bookId,
        copy.id,
        client,
      );

      let fine = null;
      if (daysOverdue > 0) {
        const config = await this.configRepo.get(client);
        const amountPaise = daysOverdue * Number(config.finePerDayPaise);
        fine = await this.fineRepo.create(
          {
            issueId: id,
            memberId: issue.memberId,
            reason: 'OVERDUE',
            amountPaise,
            assessedBy: actorPersonId,
          },
          client,
        );
      }

      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_ISSUE_RETURNED',
          objectType: 'library_issue',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: issue,
          afterData: { ...updated, fineAssessed: fine },
        },
        client,
      );
      return { ...updated, fineAssessed: fine };
    });
  }

  async renew(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const issue = await this.issueRepo.findByIdForUpdate(id, client);
      if (!issue) throw new NotFoundException('Issue not found');
      if (issue.status !== 'ISSUED' && issue.status !== 'OVERDUE') {
        throw new ConflictException('This book is not currently out on loan.');
      }

      const config = await this.configRepo.get(client);
      if (issue.renewedCount >= config.maxRenewals) {
        throw new ConflictException(
          `This book has already been renewed the maximum ${config.maxRenewals} time(s).`,
        );
      }

      const pendingReservation =
        await this.reservationRepo.findOldestPendingForBook(
          issue.bookId,
          client,
        );
      if (pendingReservation) {
        throw new ConflictException(
          "Another member is waiting for this book -- it can't be renewed.",
        );
      }

      const newDueDate = addDays(today(), config.loanPeriodDays);
      const updated = (await this.issueRepo.renew(id, newDueDate, client))!;

      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_ISSUE_RENEWED',
          objectType: 'library_issue',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: issue,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  async markLost(
    id: string,
    actorPersonId: string,
    reason?: string,
    notes?: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const issue = await this.issueRepo.findByIdForUpdate(id, client);
      if (!issue) throw new NotFoundException('Issue not found');
      if (issue.status !== 'ISSUED' && issue.status !== 'OVERDUE') {
        throw new ConflictException('This book is not currently out on loan.');
      }
      const copy = await this.copyRepo.findByIdForUpdate(issue.copyId, client);
      if (!copy) throw new NotFoundException('Copy not found');

      const updatedIssue = (await this.issueRepo.markLost(id, client))!;
      await this.copyRepo.setStatus(issue.copyId, 'LOST', client);
      const fine = await this.fineAssessment.assessLossOrDamageFine(client, {
        issueId: id,
        memberId: issue.memberId,
        reason: 'LOST',
        acquisitionCostPaise: copy.acquisitionCostPaise,
        assessedBy: actorPersonId,
      });

      // Same incident log entry Books' own mark-lost/mark-damaged writes --
      // one Lost & Damaged history regardless of which entry point a copy was
      // actually reported lost from.
      await this.lostDamagedReportRepo.create(
        {
          copyId: issue.copyId,
          issueId: id,
          memberId: issue.memberId,
          type: 'LOST',
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
          action: 'LIBRARY_ISSUE_MARKED_LOST',
          objectType: 'library_issue',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: issue,
          afterData: { ...updatedIssue, fineAssessed: fine, reason, notes },
        },
        client,
      );
      return { ...updatedIssue, fineAssessed: fine };
    });
  }
}
