// PENDING FEATURE -- parent-initiated side of Call Request. See
// HostelWardenPendingModule for why this isn't wired into AppModule yet.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PARENT_ERRORS } from '../../common/errors/error-codes';
import { OutboxService } from '../../common/outbox/outbox.service';
import { GuardianLinkRepository } from '../parent/repositories/guardian-link.repository';
import { CreateCallRequestDto } from './dto/create-call-request.dto';
import { HostelCallRequestRepository } from './repositories/hostel-call-request.repository';
import { StudentHostelRepository } from './repositories/student-hostel.repository';
import { WardenAssignmentRepository } from './repositories/warden-assignment.repository';

const NOT_A_HOSTELLER =
  'This student does not currently have an active hostel room allocation';

@Injectable()
export class ParentCallRequestsService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly callRequestRepo: HostelCallRequestRepository,
    private readonly wardenAssignmentRepo: WardenAssignmentRepository,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async list(personId: string) {
    return this.callRequestRepo.findManyForParent(personId);
  }

  async create(dto: CreateCallRequestDto, personId: string) {
    const link = await this.guardianLinkRepo.findActiveLink(
      personId,
      dto.studentId,
    );
    if (!link) throw new NotFoundException(PARENT_ERRORS.NOT_LINKED_TO_STUDENT);

    const hostelId = await this.studentHostelRepo.findCurrentHostelIdForStudent(
      dto.studentId,
    );
    if (!hostelId) throw new ForbiddenException(NOT_A_HOSTELLER);

    const request = await this.callRequestRepo.create({
      studentId: dto.studentId,
      parentPersonId: personId,
      hostelId,
      requestedFrom: new Date(dto.requestedFrom),
      requestedTo: new Date(dto.requestedTo),
    });

    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: 'HOSTEL_CALL_REQUEST_CREATED',
      objectType: 'hostel_call_request',
      objectId: request.id,
      outcome: 'SUCCESS',
      afterData: request,
    });

    // Not routed through the generic approvals engine (see this feature's own
    // repository header comment), so it needs its own real notification --
    // otherwise the warden never learns a call request exists until they
    // happen to open their own inbox.
    const wardenPersonIds =
      await this.wardenAssignmentRepo.findPersonIdsForHostel(hostelId);
    for (const wardenPersonId of wardenPersonIds) {
      await this.outbox.enqueue({
        personId: wardenPersonId,
        notificationType: 'HOSTEL_CALL_REQUEST_CREATED',
        title: 'New call request',
        body: `A parent has requested a call for a student in your hostel`,
        relatedObjectType: 'hostel_call_request',
        relatedObjectId: request.id,
      });
    }

    return request;
  }
}
