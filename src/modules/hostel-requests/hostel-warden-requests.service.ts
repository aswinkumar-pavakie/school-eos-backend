// Hostel Warden's own inbox for Gate Pass, Emergency Exit, and Call Requests
// -- scoped to whichever hostel(s) this staff member is the assigned warden
// of (hostel.warden_staff_id), resolved fresh on every call from the
// student's own current hostel_allocation, never trusted from the client.

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CallRequestRepository } from './repositories/call-request.repository';
import { HostelScopeRepository } from './repositories/hostel-scope.repository';
import { OutingRequestRepository, type OutingRequestType } from './repositories/outing-request.repository';

@Injectable()
export class HostelWardenRequestsService {
  constructor(
    private readonly outingRepo: OutingRequestRepository,
    private readonly callRepo: CallRequestRepository,
    private readonly scopeRepo: HostelScopeRepository,
    private readonly audit: AuditService,
  ) {}

  private async requireWardenHostelIds(personId: string): Promise<string[]> {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    return this.scopeRepo.getWardenHostelIds(staffId);
  }

  private async assertOwnsStudent(hostelIds: string[], studentId: string): Promise<void> {
    const allocation = await this.scopeRepo.getActiveHostelForStudent(studentId);
    if (!allocation || !hostelIds.includes(allocation.hostelId)) {
      throw new ForbiddenException('This student is not in a hostel you warden.');
    }
  }

  // ---------- Outing (Gate Pass / Emergency Exit) ----------

  async listOuting(personId: string, requestType: OutingRequestType) {
    const hostelIds = await this.requireWardenHostelIds(personId);
    return this.outingRepo.findForWardenHostels(hostelIds, requestType);
  }

  async getOuting(personId: string, requestType: OutingRequestType, id: string) {
    const hostelIds = await this.requireWardenHostelIds(personId);
    const request = await this.outingRepo.findById(id, requestType);
    if (!request) throw new NotFoundException('Request not found.');
    await this.assertOwnsStudent(hostelIds, request.studentId);
    return request;
  }

  async decideOuting(personId: string, requestType: OutingRequestType, id: string, state: 'APPROVED' | 'REJECTED', note: string | null) {
    const request = await this.getOuting(personId, requestType, id);
    if (request.state !== 'REQUESTED') {
      throw new ForbiddenException('This request has already been decided.');
    }
    await this.outingRepo.decide(id, state, personId, note);
    const updated = await this.outingRepo.findById(id, requestType);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: state === 'APPROVED' ? 'OUTING_REQUEST_APPROVED' : 'OUTING_REQUEST_REJECTED',
      objectType: 'outing_request',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: { state, note },
    });
    return updated;
  }

  // ---------- Call Requests ----------

  async listCalls(personId: string) {
    const hostelIds = await this.requireWardenHostelIds(personId);
    return this.callRepo.findForHostels(hostelIds);
  }

  async getCall(personId: string, id: string) {
    const hostelIds = await this.requireWardenHostelIds(personId);
    const request = await this.callRepo.findById(id);
    if (!request) throw new NotFoundException('Request not found.');
    if (!hostelIds.includes(request.hostelId)) {
      throw new ForbiddenException('This student is not in a hostel you warden.');
    }
    return request;
  }

  async decideCall(personId: string, id: string, input: { status: 'APPROVED' | 'REJECTED'; approvedFrom?: string; approvedTo?: string }) {
    const request = await this.getCall(personId, id);
    if (request.status !== 'PENDING') {
      throw new ForbiddenException('This request has already been decided.');
    }
    await this.callRepo.decide(id, { status: input.status, decidedBy: personId, approvedFrom: input.approvedFrom, approvedTo: input.approvedTo });
    const updated = await this.callRepo.findById(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: input.status === 'APPROVED' ? 'CALL_REQUEST_APPROVED' : 'CALL_REQUEST_REJECTED',
      objectType: 'call_request',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: input,
    });
    return updated;
  }
}
