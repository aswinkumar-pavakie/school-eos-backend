// Warden-authored Movement Log -- the design's own "Record an exit" screen:
// the Warden takes the parent's call and logs the exit directly (distinct
// from Gate Pass/Emergency Exit, which are parent-app-submitted requests
// this same Warden reviews elsewhere). See
// outing-request.repository.ts's own createDirect/findDirectEntriesForHostels
// comments for the real schema this is built on (migration
// 0021_outing_request_movement_log_fields.sql).

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { AmendMovementLogEntryDto } from './dto/amend-movement-log-entry.dto';
import { CreateMovementLogEntryDto } from './dto/create-movement-log-entry.dto';
import type { MovementLogPurpose } from './repositories/outing-request.repository';
import { OutingRequestRepository } from './repositories/outing-request.repository';
import { StudentHostelRepository } from './repositories/student-hostel.repository';
import { WardenContextService } from './warden-context.service';

const NOT_IN_WARDEN_HOSTEL =
  'This student is not currently allocated to one of your hostels';

@Injectable()
export class MovementLogService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly outingRequestRepo: OutingRequestRepository,
    private readonly audit: AuditService,
    private readonly postgres: PostgresService,
  ) {}

  async list(personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.outingRequestRepo.findDirectEntriesForHostels(ctx.hostelIds);
  }

  async create(dto: CreateMovementLogEntryDto, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const hostelId = await this.studentHostelRepo.findActiveHostelIdForStudent(
      dto.studentId,
      ctx.hostelIds,
    );
    if (!hostelId) throw new ForbiddenException(NOT_IN_WARDEN_HOSTEL);

    const entry = await this.outingRequestRepo.createDirect(
      {
        studentId: dto.studentId,
        recordedByPersonId: personId,
        outFrom: new Date(dto.outFrom),
        expectedReturn: new Date(dto.expectedReturn),
        isOvernight: dto.isOvernight,
        reason: dto.reason,
        purposeCategory: dto.purposeCategory as MovementLogPurpose,
        calledByName: dto.calledByName,
        calledByPhone: dto.calledByPhone,
      },
      this.postgres,
    );

    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: 'HOSTEL_MOVEMENT_LOG_ENTRY_CREATED',
      objectType: 'outing_request',
      objectId: entry.id,
      outcome: 'SUCCESS',
      afterData: { studentId: dto.studentId, purposeCategory: dto.purposeCategory },
    });

    return entry;
  }

  private async requireOwnDirectEntry(id: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const entry = await this.outingRequestRepo.findById(id);
    if (!entry || entry.purposeCategory === null) {
      throw new NotFoundException('Movement log entry not found');
    }
    const hostelId = await this.studentHostelRepo.findActiveHostelIdForStudent(
      entry.studentId,
      ctx.hostelIds,
    );
    if (!hostelId) throw new ForbiddenException(NOT_IN_WARDEN_HOSTEL);
    return entry;
  }

  /** Recording a return applies at the physical gate regardless of which
   * channel the outing was requested through -- a parent-app Gate Pass/
   * Emergency Exit is just as real a "student is back" event as a
   * Warden-direct entry, so this is scoped to any APPROVED outing_request
   * for the Warden's own hostel(s), not only direct entries (unlike amend
   * below, which only ever touches data the Warden themself authored). */
  private async requireApprovedEntryInScope(id: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const entry = await this.outingRequestRepo.findById(id);
    if (!entry || entry.state !== 'APPROVED') {
      throw new NotFoundException('Movement log entry not found');
    }
    const hostelId = await this.studentHostelRepo.findActiveHostelIdForStudent(
      entry.studentId,
      ctx.hostelIds,
    );
    if (!hostelId) throw new ForbiddenException(NOT_IN_WARDEN_HOSTEL);
    return entry;
  }

  async recordReturn(id: string, personId: string) {
    await this.requireApprovedEntryInScope(id, personId);
    await this.outingRequestRepo.recordReturn(id, this.postgres);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: 'HOSTEL_MOVEMENT_LOG_RETURN_RECORDED',
      objectType: 'outing_request',
      objectId: id,
      outcome: 'SUCCESS',
    });
    return this.outingRequestRepo.findById(id);
  }

  async amend(id: string, dto: AmendMovementLogEntryDto, personId: string) {
    await this.requireOwnDirectEntry(id, personId);
    const updated = await this.outingRequestRepo.amendDirect(
      id,
      {
        expectedReturn: dto.expectedReturn ? new Date(dto.expectedReturn) : undefined,
        reason: dto.reason,
        calledByName: dto.calledByName,
        calledByPhone: dto.calledByPhone,
      },
      this.postgres,
    );
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: 'HOSTEL_MOVEMENT_LOG_ENTRY_AMENDED',
      objectType: 'outing_request',
      objectId: id,
      outcome: 'SUCCESS',
    });
    return updated;
  }
}
