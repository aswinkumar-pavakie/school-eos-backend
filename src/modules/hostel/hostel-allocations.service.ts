import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { StudentRepository } from '../people/repositories/student.repository';
import { CreateHostelAllocationDto } from './dto/create-hostel-allocation.dto';
import { HostelAllocationQueryDto } from './dto/hostel-allocation-query.dto';
import { VacateHostelAllocationDto } from './dto/vacate-hostel-allocation.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { HostelAllocationRepository } from './repositories/hostel-allocation.repository';
import { HostelBedRepository } from './repositories/hostel-bed.repository';

@Injectable()
export class HostelAllocationsService {
  constructor(
    private readonly hostelAllocationRepo: HostelAllocationRepository,
    private readonly hostelBedRepo: HostelBedRepository,
    private readonly studentRepo: StudentRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  list(query: HostelAllocationQueryDto) {
    return this.hostelAllocationRepo.findMany(query);
  }

  listUnallocatedStudents(academicYearId: string) {
    return this.hostelAllocationRepo.findUnallocatedForYear(academicYearId);
  }

  async get(id: string) {
    const allocation = await this.hostelAllocationRepo.findById(id);
    if (!allocation) throw new NotFoundException('Hostel allocation not found');
    return allocation;
  }

  /** Allocating a bed and flipping it to OCCUPIED must happen atomically: lock the
   * bed row first (FOR UPDATE) so two concurrent allocation requests for the same
   * bed can't both pass the VACANT check before either commits. */
  async create(dto: CreateHostelAllocationDto, actorPersonId: string) {
    try {
      return await this.unitOfWork.run(async (client) => {
        const bed = await this.hostelBedRepo.findByIdForUpdate(
          dto.bedId,
          client,
        );
        if (!bed) throw new NotFoundException('Hostel bed not found');
        if (bed.status !== 'VACANT') {
          throw new ConflictException(
            `This bed is currently ${bed.status.toLowerCase()}, not vacant.`,
          );
        }

        // A MALE/FEMALE hostel only ever takes students of that same gender --
        // only a MIXED hostel accepts everyone. Checked here (not just filtered in
        // the UI) so a direct API call can't bypass it either.
        const hostelGender = await this.hostelBedRepo.findHostelGenderForBed(
          dto.bedId,
          client,
        );
        if (hostelGender && hostelGender !== 'MIXED') {
          const studentGender = await this.studentRepo.findGenderById(
            dto.studentId,
            client,
          );
          if (studentGender !== hostelGender) {
            throw new BadRequestException(
              studentGender
                ? `This hostel is for ${hostelGender.toLowerCase()} students only -- this student is registered as ${studentGender.toLowerCase()}.`
                : `This hostel is for ${hostelGender.toLowerCase()} students only -- this student has no gender on record.`,
            );
          }
        }

        const allocation = await this.hostelAllocationRepo.create(
          {
            studentId: dto.studentId,
            bedId: dto.bedId,
            academicYearId: dto.academicYearId,
            allocatedFrom: dto.allocatedFrom,
            allocatedBy: dto.allocatedBy,
          },
          client,
        );
        await this.hostelBedRepo.setStatus(dto.bedId, 'OCCUPIED', client);
        await this.auditService.record(
          {
            actorPersonId,
            action: 'HOSTEL_ALLOCATION_CREATED',
            objectType: 'hostel_allocation',
            objectId: allocation.id,
            outcome: 'SUCCESS',
            afterData: allocation,
          },
          client,
        );
        return allocation;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This student already has an active hostel allocation for this academic year.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'studentId, bedId, or academicYearId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  /** Vacating must also atomically free the bed back to VACANT in the same
   * transaction as the status flip, so the two never observably disagree. */
  async vacate(
    id: string,
    dto: VacateHostelAllocationDto,
    actorPersonId: string,
  ) {
    const existing = await this.get(id);
    if (existing.status !== 'ACTIVE') {
      throw new ConflictException('This allocation is not currently active.');
    }
    const allocatedTo =
      dto.allocatedTo ?? new Date().toISOString().slice(0, 10);

    return this.unitOfWork.run(async (client) => {
      const updated = await this.hostelAllocationRepo.vacate(
        id,
        allocatedTo,
        client,
      );
      await this.hostelBedRepo.setStatus(existing.bedId, 'VACANT', client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'HOSTEL_ALLOCATION_VACATED',
          objectType: 'hostel_allocation',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }
}
