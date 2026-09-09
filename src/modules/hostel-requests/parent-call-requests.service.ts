// Parent-initiated Call Request -- guardian-checked, requires an active
// hostel boarder (same real rule as Gate Pass/Emergency Exit). hostelId is
// always resolved server-side from the student's own current
// hostel_allocation, never trusted from the client.

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GuardianLinkRepository } from '../parent/repositories/guardian-link.repository';
import { CallRequestRepository } from './repositories/call-request.repository';
import { CreateCallRequestDto } from './dto/create-call-request.dto';
import { HostelScopeRepository } from './repositories/hostel-scope.repository';

@Injectable()
export class ParentCallRequestsService {
  constructor(
    private readonly callRepo: CallRequestRepository,
    private readonly scopeRepo: HostelScopeRepository,
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly audit: AuditService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  /** Every call request this parent has themselves raised, across all their
   * linked children -- see school-eos-mobile's own listCallRequests(), which
   * takes no studentId. */
  async listMine(personId: string) {
    return this.callRepo.findByParent(personId);
  }

  async create(personId: string, dto: CreateCallRequestDto) {
    await this.assertGuardian(personId, dto.studentId);
    const allocation = await this.scopeRepo.getActiveHostelForStudent(dto.studentId);
    if (!allocation) {
      throw new BadRequestException('This student does not have an active hostel allocation.');
    }
    if (new Date(dto.requestedTo).getTime() < new Date(dto.requestedFrom).getTime()) {
      throw new BadRequestException('requestedTo must be on or after requestedFrom.');
    }
    const id = await this.callRepo.create({
      studentId: dto.studentId,
      parentPersonId: personId,
      hostelId: allocation.hostelId,
      requestedFrom: dto.requestedFrom,
      requestedTo: dto.requestedTo,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: 'CALL_REQUEST_CREATED',
      objectType: 'call_request',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return this.callRepo.findById(id);
  }
}
