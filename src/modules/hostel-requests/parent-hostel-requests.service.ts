// Parent-initiated Gate Pass / Emergency Exit -- guardian-checked (same real
// ACTIVE guardian_link boundary every other Parent feature enforces) and
// requires the student to actually be a current, ACTIVE hostel boarder --
// the backend's own real rejection school-eos-mobile's my-class/index.tsx
// already documents ("the backend itself rejects a request for a student
// with no active hostel allocation").

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GuardianLinkRepository } from '../parent/repositories/guardian-link.repository';
import { CreateOutingRequestDto } from './dto/create-outing-request.dto';
import { HostelScopeRepository } from './repositories/hostel-scope.repository';
import { OutingRequestRepository, type OutingRequestType } from './repositories/outing-request.repository';

@Injectable()
export class ParentHostelRequestsService {
  constructor(
    private readonly outingRepo: OutingRequestRepository,
    private readonly scopeRepo: HostelScopeRepository,
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly audit: AuditService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  private async assertActiveBoarder(studentId: string) {
    const allocation = await this.scopeRepo.getActiveHostelForStudent(studentId);
    if (!allocation) {
      throw new BadRequestException('This student does not have an active hostel allocation.');
    }
    return allocation;
  }

  /** Every request this parent has themselves raised, across all their
   * linked children -- see school-eos-mobile's own listMyGatePassRequests(),
   * which takes no studentId. */
  async listMine(personId: string, requestType: OutingRequestType) {
    return this.outingRepo.findByRequestedBy(personId, requestType);
  }

  async create(personId: string, requestType: OutingRequestType, dto: CreateOutingRequestDto) {
    await this.assertGuardian(personId, dto.studentId);
    await this.assertActiveBoarder(dto.studentId);
    if (new Date(dto.expectedReturn).getTime() <= new Date(dto.outFrom).getTime()) {
      throw new BadRequestException('expectedReturn must be strictly after outFrom.');
    }
    const id = await this.outingRepo.create({
      studentId: dto.studentId,
      requestedBy: personId,
      requestType,
      outFrom: dto.outFrom,
      expectedReturn: dto.expectedReturn,
      isOvernight: dto.isOvernight ?? false,
      reason: dto.reason,
      destination: dto.destination ?? null,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: requestType === 'GATE_PASS' ? 'GATE_PASS_REQUESTED' : 'EMERGENCY_EXIT_REQUESTED',
      objectType: 'outing_request',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return this.outingRepo.findById(id, requestType);
  }
}
