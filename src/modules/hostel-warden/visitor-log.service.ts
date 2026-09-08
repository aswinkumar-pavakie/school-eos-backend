import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import { CreateHostelVisitorDto } from './dto/create-hostel-visitor.dto';
import { HostelVisitorRepository } from './repositories/hostel-visitor.repository';
import { StudentHostelRepository } from './repositories/student-hostel.repository';
import { WardenContextService } from './warden-context.service';

@Injectable()
export class VisitorLogService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly visitorRepo: HostelVisitorRepository,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(personId: string, openOnly: boolean) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.visitorRepo.findMany(ctx.hostelIds, { openOnly });
  }

  private async getScoped(id: string, hostelIds: string[]) {
    const visitor = await this.visitorRepo.findById(id);
    if (!visitor)
      throw new NotFoundException(HOSTEL_WARDEN_ERRORS.VISITOR_NOT_FOUND);
    const hostelId = await this.studentHostelRepo.findActiveHostelIdForStudent(
      visitor.studentId,
      hostelIds,
    );
    if (!hostelId)
      throw new NotFoundException(HOSTEL_WARDEN_ERRORS.VISITOR_NOT_FOUND);
    return visitor;
  }

  async get(id: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.getScoped(id, ctx.hostelIds);
  }

  async recordEntry(dto: CreateHostelVisitorDto, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const hostelId = await this.studentHostelRepo.findActiveHostelIdForStudent(
      dto.studentId,
      ctx.hostelIds,
    );
    if (!hostelId) {
      await this.auditService.record({
        actorPersonId: personId,
        actorRoleCode: 'HOSTEL_WARDEN',
        action: 'HOSTEL_VISITOR_ENTRY_DENIED',
        objectType: 'hostel_visitor',
        objectId: dto.studentId,
        outcome: 'DENIED',
        afterData: { reason: HOSTEL_WARDEN_ERRORS.STUDENT_NOT_IN_HOSTEL },
      });
      // 404, not 403 -- same convention as Night Attendance (see its own comment).
      throw new NotFoundException(HOSTEL_WARDEN_ERRORS.STUDENT_NOT_IN_HOSTEL);
    }

    const visitor = await this.visitorRepo.create({
      studentId: dto.studentId,
      visitorName: dto.visitorName,
      relationship: dto.relationship,
      idProofRef: dto.idProofRef,
      phone: dto.phone,
      recordedBy: personId,
    });

    await this.auditService.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: 'HOSTEL_VISITOR_ENTRY_RECORDED',
      objectType: 'hostel_visitor',
      objectId: visitor.id,
      outcome: 'SUCCESS',
      afterData: visitor,
    });

    return visitor;
  }

  /** 0 rows updated (already exited) is treated as a safe no-op, not an error --
   * the service just returns the visitor's current (already-exited) state. */
  async recordExit(id: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const visitor = await this.getScoped(id, ctx.hostelIds);

    const updated = await this.visitorRepo.markExited(id);
    const fresh = await this.visitorRepo.findById(id);

    await this.auditService.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: updated
        ? 'HOSTEL_VISITOR_EXIT_RECORDED'
        : 'HOSTEL_VISITOR_EXIT_ALREADY_RECORDED',
      objectType: 'hostel_visitor',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: visitor,
      afterData: fresh,
    });

    return fresh!;
  }
}
