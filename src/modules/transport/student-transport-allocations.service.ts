import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { CancelStudentTransportAllocationDto } from './dto/cancel-student-transport-allocation.dto';
import { CreateStudentTransportAllocationDto } from './dto/create-student-transport-allocation.dto';
import { StudentTransportAllocationQueryDto } from './dto/student-transport-allocation-query.dto';
import { UpdateStudentTransportAllocationDto } from './dto/update-student-transport-allocation.dto';
import { RequestStudentTransportAllocationCancelDto } from './dto/request-student-transport-allocation-cancel.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { StudentTransportAllocationRepository } from './repositories/student-transport-allocation.repository';

@Injectable()
export class StudentTransportAllocationsService {
  constructor(
    private readonly allocationRepo: StudentTransportAllocationRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly approvalsService: ApprovalsService,
  ) {}

  list(query: StudentTransportAllocationQueryDto) {
    return this.allocationRepo.findMany(query);
  }

  /** Resolved route/stop/vehicle/driver view for one student -- backs the Student
   * profile's Transport section. */
  getSummaryForStudent(studentId: string) {
    return this.allocationRepo.findSummaryForStudent(studentId);
  }

  async get(id: string) {
    const allocation = await this.allocationRepo.findById(id);
    if (!allocation)
      throw new NotFoundException('Student transport allocation not found');
    return allocation;
  }

  async create(
    dto: CreateStudentTransportAllocationDto,
    actorPersonId: string,
  ) {
    try {
      const created = await this.allocationRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'STUDENT_TRANSPORT_ALLOCATION_CREATED',
        objectType: 'student_transport_allocation',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This student already has an active transport allocation for this direction and academic year.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'studentId, routeStopId, or academicYearId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateStudentTransportAllocationDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(id);
    try {
      const updated = await this.allocationRepo.update(id, dto);
      if (!updated)
        throw new NotFoundException('Student transport allocation not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STUDENT_TRANSPORT_ALLOCATION_UPDATED',
        objectType: 'student_transport_allocation',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'routeStopId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  async cancel(
    id: string,
    dto: CancelStudentTransportAllocationDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(id);
    if (existing.status !== 'ACTIVE') {
      throw new ConflictException('This allocation is not currently active.');
    }
    const validTo = dto.validTo ?? new Date().toISOString().slice(0, 10);
    const updated = await this.allocationRepo.cancel(id, validTo);
    await this.auditService.record({
      actorPersonId,
      action: 'STUDENT_TRANSPORT_ALLOCATION_CANCELLED',
      objectType: 'student_transport_allocation',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }

  /** Transport Manager has no direct cancel access (see controller's own
   * comment) -- this is their own request, routed through the generic
   * approvals engine to a real ADMIN decision. The actual cancel only
   * happens in transport-approval-handlers.service.ts's own
   * 'student_transport_allocation' onApproved -- never here. */
  async requestCancel(
    id: string,
    dto: RequestStudentTransportAllocationCancelDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(id);
    if (existing.status !== 'ACTIVE') {
      throw new ConflictException('This allocation is not currently active.');
    }
    return this.unitOfWork.run(async (client) => {
      const { rows: pending } = await client.query(
        `SELECT id FROM approval_request WHERE subject_object_type = 'student_transport_allocation' AND subject_object_id = $1 AND state IN ('PENDING', 'RETROSPECTIVE_PENDING') LIMIT 1`,
        [id],
      );
      if (pending[0]) {
        throw new ConflictException(
          'A removal request for this allocation is already pending Admin review.',
        );
      }
      const request = await this.approvalsService.createRequest(
        {
          requestType: 'STUDENT_TRANSPORT_ALLOCATION_CANCEL',
          subjectObjectType: 'student_transport_allocation',
          subjectObjectId: id,
          requestedBy: actorPersonId,
          payload: {
            studentLabel: dto.studentLabel,
            validTo: dto.validTo,
            reason: dto.reason,
          },
        },
        client,
      );
      await this.auditService.record(
        {
          actorPersonId,
          action: 'STUDENT_TRANSPORT_ALLOCATION_CANCEL_REQUESTED',
          objectType: 'student_transport_allocation',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { approvalRequestId: request.id, reason: dto.reason },
        },
        client,
      );
      return request;
    });
  }
}
