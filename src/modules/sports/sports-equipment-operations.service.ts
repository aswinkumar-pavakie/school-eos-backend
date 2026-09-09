// Sports Operations — equipment issue/return (Sports Faculty, mobile). Read-only
// against Admin's master equipment/sport catalog (see sports.module.ts's own
// header comment: structure/assets stay Admin-only); this service only ever
// moves quantity_available up/down and records who-issued-what-to-whom-why.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  EVENT_SIGNATURES_BUCKET,
  isRealPngBuffer,
  SIGNATURE_MAX_SIZE_BYTES,
} from '../student-events/student-event-storage.util';
import { equipmentIssueSignatureObjectKeyFor } from './equipment-issue-storage.util';
import { IssueEquipmentDto } from './dto/issue-equipment.dto';
import { ReturnEquipmentDto } from './dto/return-equipment.dto';
import {
  EquipmentIssueRepository,
  EquipmentIssueRow,
} from './repositories/equipment-issue.repository';
import {
  EquipmentRepository,
  EquipmentRow,
} from './repositories/equipment.repository';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';
import { TeamRepository } from './repositories/team.repository';

@Injectable()
export class SportsEquipmentOperationsService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly equipmentRepo: EquipmentRepository,
    private readonly equipmentIssueRepo: EquipmentIssueRepository,
    private readonly teamRepo: TeamRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async requireActiveFaculty(actor: AuthenticatedUser): Promise<void> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE') {
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
    }
  }

  /** Equipment belonging to any sport this Faculty member is currently
   * authorized for — read-only, never creatable/editable here (Admin-only,
   * see EquipmentController). */
  async listMyEquipment(actor: AuthenticatedUser): Promise<EquipmentRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    const all = await this.equipmentRepo.findMany();
    return all.filter((e) => e.sportId && sportIds.includes(e.sportId));
  }

  private async getAuthorizedEquipmentOrThrow(
    actor: AuthenticatedUser,
    equipmentId: string,
  ): Promise<EquipmentRow> {
    const equipment = await this.equipmentRepo.findById(equipmentId);
    if (!equipment || !equipment.sportId)
      throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_NOT_FOUND);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      equipment.sportId,
    );
    if (!authorized)
      throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_NOT_FOUND);
    return equipment;
  }

  /**
   * Issues equipment to a student or team. Locks the equipment row first
   * (SELECT...FOR UPDATE inside the same transaction) so two concurrent issues
   * can never push quantity_available negative — the single-holder-of-a-resource
   * rule from .claude/CLAUDE.md. The student's signature is validated exactly
   * like SignPermissionRequestDto/ParentPermissionsService.sign (base64 PNG,
   * size-capped, real magic-bytes check) before ever touching Storage.
   */
  async issue(
    actor: AuthenticatedUser,
    equipmentId: string,
    dto: IssueEquipmentDto,
    idempotencyKey: string,
  ): Promise<EquipmentIssueRow> {
    await this.requireActiveFaculty(actor);
    const equipment = await this.getAuthorizedEquipmentOrThrow(
      actor,
      equipmentId,
    );

    if (dto.issuedToTeamId) {
      const team = await this.teamRepo.findById(dto.issuedToTeamId);
      if (!team) throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);
      const authorizedForTeam =
        await this.sportsFacultyRepo.isAuthorizedForSport(
          actor.personId,
          team.sportId,
        );
      if (!authorizedForTeam)
        throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);
    }

    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(dto.signaturePngBase64, 'base64');
    } catch {
      throw new BadRequestException('The signature could not be read.');
    }
    if (signatureBuffer.length === 0)
      throw new BadRequestException('A signature image is required.');
    if (signatureBuffer.length > SIGNATURE_MAX_SIZE_BYTES)
      throw new BadRequestException('The signature image is too large.');
    if (!isRealPngBuffer(signatureBuffer))
      throw new BadRequestException('The signature is not a valid PNG image.');

    const issue = await this.unitOfWork.run(async (client) => {
      const locked = await this.equipmentIssueRepo.lockEquipment(
        equipment.id,
        client,
      );
      if (!locked)
        throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_NOT_FOUND);
      if (locked.quantityAvailable < dto.quantity) {
        throw new ConflictException(SPORTS_ERRORS.INSUFFICIENT_STOCK);
      }

      // Issue id is minted before the signature upload so the object key can
      // be traced back to this exact issue row — same ordering as
      // signatureObjectKeyFor(participantId) in student-events.
      const created = await this.equipmentIssueRepo.create(
        {
          equipmentId: equipment.id,
          issuedToStudentId: dto.issuedToStudentId ?? null,
          issuedToTeamId: dto.issuedToTeamId ?? null,
          quantity: dto.quantity,
          dueOn: dto.dueOn ?? null,
          issueReason: dto.reason,
          signatureObjectKey: '', // placeholder, patched right below in the same transaction
          issuedBy: actor.personId,
        },
        client,
      );

      const objectKey = equipmentIssueSignatureObjectKeyFor(created.id);
      await this.storage.upload(
        EVENT_SIGNATURES_BUCKET,
        objectKey,
        signatureBuffer,
        'image/png',
      );
      await client.query(
        `UPDATE equipment_issue SET signature_object_key = $2 WHERE id = $1`,
        [created.id, objectKey],
      );

      await this.equipmentIssueRepo.adjustAvailable(
        equipment.id,
        -dto.quantity,
        client,
      );

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FACULTY',
          action: 'SPORTS_EQUIPMENT_ISSUED',
          objectType: 'equipment_issue',
          objectId: created.id,
          outcome: 'SUCCESS',
          afterData: {
            ...created,
            signatureObjectKey: objectKey,
            idempotencyKey,
          },
        },
        client,
      );

      return (await this.equipmentIssueRepo.findById(created.id, client))!;
    });

    return issue;
  }

  async recordReturn(
    actor: AuthenticatedUser,
    issueId: string,
    dto: ReturnEquipmentDto,
  ): Promise<EquipmentIssueRow> {
    await this.requireActiveFaculty(actor);

    return this.unitOfWork.run(async (client) => {
      const locked = await this.equipmentIssueRepo.findByIdForUpdate(
        issueId,
        client,
      );
      if (!locked)
        throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_ISSUE_NOT_FOUND);
      if (locked.returnedOn)
        throw new ConflictException(SPORTS_ERRORS.ALREADY_RETURNED);

      // Re-check sport authorization for the issue's own equipment, live.
      const { rows } = await client.query<{ sport_id: string | null }>(
        `SELECT sport_id FROM equipment WHERE id = $1`,
        [locked.equipmentId],
      );
      const sportId = rows[0]?.sport_id ?? null;
      if (
        !sportId ||
        !(await this.sportsFacultyRepo.isAuthorizedForSport(
          actor.personId,
          sportId,
          client,
        ))
      ) {
        throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_ISSUE_NOT_FOUND);
      }

      await this.equipmentIssueRepo.recordReturn(
        issueId,
        dto.conditionOnReturn ?? null,
        client,
      );
      await this.equipmentIssueRepo.adjustAvailable(
        locked.equipmentId,
        locked.quantity,
        client,
      );

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FACULTY',
          action: 'SPORTS_EQUIPMENT_RETURNED',
          objectType: 'equipment_issue',
          objectId: issueId,
          outcome: 'SUCCESS',
          afterData: dto,
        },
        client,
      );

      return (await this.equipmentIssueRepo.findById(issueId, client))!;
    });
  }

  async listOutstanding(
    actor: AuthenticatedUser,
  ): Promise<EquipmentIssueRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.equipmentIssueRepo.findOutstandingBySportIds(sportIds);
  }

  /** Cheap add-on: anything outstanding past its due_on. */
  async listOverdue(actor: AuthenticatedUser): Promise<EquipmentIssueRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.equipmentIssueRepo.findOverdueBySportIds(sportIds);
  }

  /** Cheap add-on: equipment at/below a threshold — visible before it becomes a
   * match-day problem. Threshold is a query param, not hardcoded, since "low"
   * means something different per equipment type (5 balls vs 20 bibs). */
  async listLowStock(
    actor: AuthenticatedUser,
    threshold: number,
  ): Promise<EquipmentRow[]> {
    if (threshold < 0) throw new BadRequestException('threshold must be >= 0');
    const mine = await this.listMyEquipment(actor);
    return mine.filter((e) => e.quantityAvailable <= threshold);
  }
}
