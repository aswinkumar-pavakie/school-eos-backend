import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { BlockIdCardDto } from './dto/block-id-card.dto';
import { CreateIdCardDto } from './dto/create-id-card.dto';
import { IdCardQueryDto } from './dto/id-card-query.dto';
import { ReissueIdCardDto } from './dto/reissue-id-card.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { IdCardRepository } from './repositories/id-card.repository';

@Injectable()
export class IdCardsService {
  constructor(
    private readonly idCardRepo: IdCardRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  list(query: IdCardQueryDto) {
    return this.idCardRepo.findMany(query);
  }

  async get(id: string) {
    const card = await this.idCardRepo.findById(id);
    if (!card) throw new NotFoundException('ID card not found');
    return card;
  }

  async create(dto: CreateIdCardDto, actor: AuthenticatedUser) {
    try {
      const created = await this.idCardRepo.create({
        ...dto,
        issuedBy: actor.personId,
      });
      await this.auditService.record({
        actorPersonId: actor.personId,
        action: 'ID_CARD_ISSUED',
        objectType: 'id_card',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This holder already has an active ID card, or this cardUid is already in use.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'studentId or staffId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  async block(id: string, dto: BlockIdCardDto, actor: AuthenticatedUser) {
    const updated = await this.idCardRepo.block(
      id,
      dto.status,
      actor.personId,
      dto.blockedReason,
    );
    if (!updated) throw new NotFoundException('ID card not found');
    await this.auditService.record({
      actorPersonId: actor.personId,
      action: 'ID_CARD_BLOCKED',
      objectType: 'id_card',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }

  /** Reissue must flip the old card to REPLACED and insert the new ACTIVE one
   * atomically -- otherwise the partial-unique "one ACTIVE card per holder" index
   * would reject the new insert while the old one is still ACTIVE. Lock the old row
   * first so two concurrent reissue attempts can't both pass the status check.
   *
   * Allowed from ACTIVE, LOST, DAMAGED, or BLOCKED -- block-then-reissue (a card is
   * lost, so it gets blocked, then a replacement is issued) is the primary real-world
   * flow, not an edge case. Only REPLACED (already superseded) and EXPIRED are
   * terminal here. */
  async reissue(
    oldCardId: string,
    dto: ReissueIdCardDto,
    actor: AuthenticatedUser,
  ) {
    const old = await this.idCardRepo.findById(oldCardId);
    if (!old) throw new NotFoundException('ID card not found');

    return this.unitOfWork.run(async (client) => {
      const locked = await this.idCardRepo.findByIdForUpdate(oldCardId, client);
      if (!locked) throw new NotFoundException('ID card not found');
      if (locked.status === 'REPLACED' || locked.status === 'EXPIRED') {
        throw new BadRequestException(
          `A ${locked.status.toLowerCase()} card cannot be reissued.`,
        );
      }

      await this.idCardRepo.markReplaced(oldCardId, client);
      try {
        const created = await this.idCardRepo.create(
          {
            cardUid: dto.cardUid,
            cardTech: dto.cardTech,
            holderType: old.holderType,
            studentId: old.studentId,
            staffId: old.staffId,
            issuedBy: actor.personId,
            printBatch: dto.printBatch,
            replacesCardId: oldCardId,
          },
          client,
        );
        await this.auditService.record(
          {
            actorPersonId: actor.personId,
            action: 'ID_CARD_REISSUED',
            objectType: 'id_card',
            objectId: created.id,
            outcome: 'SUCCESS',
            beforeData: { replacedCardId: oldCardId },
            afterData: created,
          },
          client,
        );
        return created;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException('This cardUid is already in use.');
        }
        throw err;
      }
    });
  }

  /** Only valid from BLOCKED -- a card found again after being reported blocked, as
   * opposed to LOST/DAMAGED where the physical card is compromised and reissue is the
   * right path instead. Must also fail cleanly if the holder already has a different
   * ACTIVE card (e.g. they were already reissued a replacement while this one was
   * blocked) -- lock the row first so two concurrent unblock attempts can't both pass
   * the status check. */
  async unblock(id: string, actorPersonId: string) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.idCardRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('ID card not found');
      if (locked.status !== 'BLOCKED') {
        throw new ConflictException(
          `This card is ${locked.status.toLowerCase()}, not blocked.`,
        );
      }

      const holderId =
        locked.holderType === 'STUDENT' ? locked.studentId : locked.staffId;
      const existingActive = holderId
        ? await this.idCardRepo.findActiveByHolder(
            locked.holderType,
            holderId,
            client,
          )
        : null;
      if (existingActive) {
        throw new ConflictException(
          'This holder already has a different active card; unblocking would create a second active card.',
        );
      }

      const updated = (await this.idCardRepo.unblock(id, client))!;
      await this.auditService.record(
        {
          actorPersonId,
          action: 'ID_CARD_UNBLOCKED',
          objectType: 'id_card',
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
