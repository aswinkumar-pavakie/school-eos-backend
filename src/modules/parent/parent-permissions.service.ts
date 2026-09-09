// Parent-side of the event permission (digital consent) feature. The real
// authorization boundary here is the same one parent-fees.controller.ts's own
// GuardianLinkRepository already establishes: role alone only proves "this
// caller is *a* parent" -- every request-scoped action re-checks a real, ACTIVE
// guardian_link exists between the caller and that exact student first (see
// StudentEventParticipantRepository.findGuardianAccess).
//
// Decisions (reject/sign) are made under SELECT ... FOR UPDATE inside a single
// transaction so two guardians of the same student (e.g. father + mother, both
// with their own ACTIVE link) can never race a double-decision -- whichever one
// commits first wins; the second sees the row already decided and is rejected
// with a clear conflict, matching the same double-action-prevention pattern
// InventoryItemsService already uses for stock/status changes.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { PermissionLetterDataService } from '../student-events/permission-letter-data.service';
import { StudentEventParticipantRepository } from '../student-events/repositories/student-event-participant.repository';
import { StudentEventRepository } from '../student-events/repositories/student-event.repository';
import {
  EVENT_SIGNATURES_BUCKET,
  SIGNATURE_MAX_SIZE_BYTES,
  isRealPngBuffer,
  signatureObjectKeyFor,
} from '../student-events/student-event-storage.util';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';

@Injectable()
export class ParentPermissionsService {
  constructor(
    private readonly participantRepo: StudentEventParticipantRepository,
    private readonly eventRepo: StudentEventRepository,
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly letterDataService: PermissionLetterDataService,
    private readonly storage: StorageService,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(actorPersonId: string) {
    return this.participantRepo.findForGuardian(actorPersonId);
  }

  private async assertAccess(actorPersonId: string, participantId: string): Promise<void> {
    const access = await this.participantRepo.findGuardianAccess(actorPersonId, participantId);
    if (!access) throw new NotFoundException('Permission request not found');
  }

  async get(participantId: string, actorPersonId: string) {
    await this.assertAccess(actorPersonId, participantId);
    const participant = await this.participantRepo.findById(participantId);
    if (!participant) throw new NotFoundException('Permission request not found');
    const event = await this.eventRepo.findById(participant.eventId);
    return { participant, event };
  }

  async reject(participantId: string, actorPersonId: string): Promise<void> {
    await this.assertAccess(actorPersonId, participantId);
    await this.unitOfWork.run(async (client) => {
      const locked = await this.participantRepo.findByIdForUpdate(participantId, client);
      if (!locked) throw new NotFoundException('Permission request not found');
      if (locked.state !== 'PENDING') {
        throw new ConflictException('This request has already been decided.');
      }
      const updated = await this.participantRepo.setDecision(
        participantId,
        { state: 'REJECTED', decidedByPersonId: actorPersonId, signatureObjectKey: null },
        client,
      );
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: 'PARENT',
          action: 'STUDENT_EVENT_PERMISSION_REJECTED',
          objectType: 'student_event_participant',
          objectId: participantId,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
    });
  }

  async sign(participantId: string, signaturePngBase64: string, actorPersonId: string): Promise<void> {
    // Plain base64 in a JSON field, not a multipart file -- React Native's own
    // Blob polyfill cannot construct a Blob from raw bytes (only from strings
    // or other Blobs), so a real multipart upload built from a captured
    // base64 signature was never actually possible from the mobile app; this
    // sidesteps that entirely (see SignPermissionRequestDto's own note).
    let buffer: Buffer;
    try {
      buffer = Buffer.from(signaturePngBase64, 'base64');
    } catch {
      throw new BadRequestException('The signature could not be read.');
    }
    if (buffer.length === 0) throw new BadRequestException('A signature image is required.');
    if (buffer.length > SIGNATURE_MAX_SIZE_BYTES) {
      throw new BadRequestException('The signature image is too large.');
    }
    // Real content check (the file's own magic bytes), not just trusting the
    // caller's own label -- a legal consent signature is exactly the kind of
    // upload worth verifying isn't spoofed/corrupt before it ever reaches
    // Storage.
    if (!isRealPngBuffer(buffer)) {
      throw new BadRequestException('The signature is not a valid PNG image.');
    }
    await this.assertAccess(actorPersonId, participantId);

    // Locked read first (inside the same transaction the decision itself
    // commits in) to fail fast on an already-decided request before ever
    // uploading a signature image nobody will use.
    await this.unitOfWork.run(async (client) => {
      const locked = await this.participantRepo.findByIdForUpdate(participantId, client);
      if (!locked) throw new NotFoundException('Permission request not found');
      if (locked.state !== 'PENDING') {
        throw new ConflictException('This request has already been decided.');
      }

      const objectKey = signatureObjectKeyFor(participantId);
      await this.storage.upload(EVENT_SIGNATURES_BUCKET, objectKey, buffer, 'image/png');

      const updated = await this.participantRepo.setDecision(
        participantId,
        { state: 'APPROVED', decidedByPersonId: actorPersonId, signatureObjectKey: objectKey },
        client,
      );
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: 'PARENT',
          action: 'STUDENT_EVENT_PERMISSION_APPROVED',
          objectType: 'student_event_participant',
          objectId: participantId,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
    });
  }

  async getPermissionLetter(participantId: string, actorPersonId: string) {
    await this.assertAccess(actorPersonId, participantId);
    return this.letterDataService.build(participantId);
  }
}
