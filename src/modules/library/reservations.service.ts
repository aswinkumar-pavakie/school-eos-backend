import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { Queryable } from '../../infrastructure/postgres/postgres.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationQueryDto } from './dto/reservation-query.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { LibraryBookCopyRepository } from './repositories/library-book-copy.repository';
import { LibraryBookRepository } from './repositories/library-book.repository';
import { LibraryMemberRepository } from './repositories/library-member.repository';
import { LibraryReservationRepository } from './repositories/library-reservation.repository';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationRepo: LibraryReservationRepository,
    private readonly bookRepo: LibraryBookRepository,
    private readonly memberRepo: LibraryMemberRepository,
    private readonly copyRepo: LibraryBookCopyRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  /** Lazy self-healing, same pattern as library-issue.repository.ts's
   * flipOverdueRows() -- a READY reservation past its hold window expires and
   * releases (or cascades) its copy the moment anything reads reservation
   * state, no cron needed. */
  private async expireStalePickups(): Promise<void> {
    const expired = await this.reservationRepo.findExpiredReady();
    for (const reservation of expired) {
      await this.unitOfWork.run(async (client) => {
        // Re-check under lock -- another request may have already resolved
        // this one (fulfilled/cancelled) between the read above and now.
        const current = await this.reservationRepo.findByIdForUpdate(
          reservation.id,
          client,
        );
        if (!current || current.status !== 'READY') return;
        const heldCopy = await this.copyRepo.findOneByBookAndStatus(
          reservation.bookId,
          'RESERVED',
          client,
        );
        await this.reservationRepo.setStatus(
          reservation.id,
          'EXPIRED',
          null,
          client,
        );
        if (heldCopy)
          await this.releaseOrPromoteHold(
            reservation.bookId,
            heldCopy.id,
            client,
          );
        await this.auditService.record(
          {
            action: 'LIBRARY_RESERVATION_EXPIRED',
            objectType: 'library_reservation',
            objectId: reservation.id,
            outcome: 'SUCCESS',
            beforeData: current,
          },
          client,
        );
      });
    }
  }

  /** Decides a specific copy's fate for a book with a reservation queue: if a
   * PENDING reservation is waiting, the copy is held (RESERVED) and that
   * reservation becomes READY; otherwise the copy is freed to AVAILABLE.
   * `copyId` is explicit rather than looked up here, since the two callers
   * mean different things by "the copy": CirculationService.returnBook passes
   * the copy that was just returned (still ISSUED at call time, about to be
   * decided for the first time); cancel/expire below passes the copy that was
   * already RESERVED and needs reassigning now that its holder fell through. */
  async releaseOrPromoteHold(
    bookId: string,
    copyId: string,
    client: Queryable,
  ): Promise<void> {
    const next = await this.reservationRepo.findOldestPendingForBook(
      bookId,
      client,
    );
    if (next) {
      await this.copyRepo.setStatus(copyId, 'RESERVED', client);
      await this.reservationRepo.markReady(next.id, client);
    } else {
      await this.copyRepo.setStatus(copyId, 'AVAILABLE', client);
    }
  }

  async list(query: ReservationQueryDto) {
    await this.expireStalePickups();
    return this.reservationRepo.findMany(query);
  }

  async get(id: string) {
    await this.expireStalePickups();
    const reservation = await this.reservationRepo.findById(id);
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }

  async create(dto: CreateReservationDto, actorPersonId: string) {
    await this.expireStalePickups();

    const member = await this.memberRepo.findById(dto.memberId);
    if (!member) throw new NotFoundException('Member not found');
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException(
        `This member is ${member.status.toLowerCase()} -- they can't reserve a book.`,
      );
    }

    const book = await this.bookRepo.findById(dto.bookId);
    if (!book) throw new NotFoundException('Book not found');
    if (book.status !== 'ACTIVE') {
      throw new BadRequestException(
        "This book has been withdrawn from the catalog -- it can't be reserved.",
      );
    }

    const availableCopies = await this.copyRepo.countAvailableForBook(
      dto.bookId,
    );
    if (availableCopies > 0) {
      throw new ConflictException(
        'This book has an available copy -- issue it directly instead of reserving.',
      );
    }

    const existing = await this.reservationRepo.findActiveForMemberAndBook(
      dto.memberId,
      dto.bookId,
    );
    if (existing)
      throw new ConflictException(
        'This member already has an active reservation on this book.',
      );

    try {
      const created = await this.reservationRepo.create(
        dto.bookId,
        dto.memberId,
      );
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_RESERVATION_CREATED',
        objectType: 'library_reservation',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'bookId or memberId does not refer to an existing record.',
        );
      throw err;
    }
  }

  async cancel(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const existing = await this.reservationRepo.findByIdForUpdate(id, client);
      if (!existing) throw new NotFoundException('Reservation not found');
      if (existing.status !== 'PENDING' && existing.status !== 'READY') {
        throw new ConflictException(
          'Only a pending or ready reservation can be cancelled.',
        );
      }
      const wasReady = existing.status === 'READY';
      const heldCopy = wasReady
        ? await this.copyRepo.findOneByBookAndStatus(
            existing.bookId,
            'RESERVED',
            client,
          )
        : null;
      const updated = (await this.reservationRepo.setStatus(
        id,
        'CANCELLED',
        null,
        client,
      ))!;
      if (heldCopy) {
        await this.releaseOrPromoteHold(existing.bookId, heldCopy.id, client);
      }
      await this.auditService.record(
        {
          actorPersonId,
          action: 'LIBRARY_RESERVATION_CANCELLED',
          objectType: 'library_reservation',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: existing,
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }
}
