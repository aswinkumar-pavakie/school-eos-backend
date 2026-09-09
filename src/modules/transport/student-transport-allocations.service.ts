import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CancelStudentTransportAllocationDto } from './dto/cancel-student-transport-allocation.dto';
import { CreateStudentTransportAllocationDto } from './dto/create-student-transport-allocation.dto';
import { StudentTransportAllocationQueryDto } from './dto/student-transport-allocation-query.dto';
import { UpdateStudentTransportAllocationDto } from './dto/update-student-transport-allocation.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { StudentTransportAllocationRepository } from './repositories/student-transport-allocation.repository';

@Injectable()
export class StudentTransportAllocationsService {
  constructor(
    private readonly allocationRepo: StudentTransportAllocationRepository,
    private readonly auditService: AuditService,
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
    if (!allocation) throw new NotFoundException('Student transport allocation not found');
    return allocation;
  }

  async create(dto: CreateStudentTransportAllocationDto, actorPersonId: string) {
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
        throw new NotFoundException('studentId, routeStopId, or academicYearId does not refer to an existing record.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateStudentTransportAllocationDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.allocationRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Student transport allocation not found');
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
        throw new NotFoundException('routeStopId does not refer to an existing record.');
      }
      throw err;
    }
  }

  async cancel(id: string, dto: CancelStudentTransportAllocationDto, actorPersonId: string) {
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
}
