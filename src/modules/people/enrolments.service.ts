import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import { TransferEnrolmentDto } from './dto/transfer-enrolment.dto';
import { UpdateEnrolmentDto } from './dto/update-enrolment.dto';
import { isUniqueViolation } from './pg-error.util';
import { StudentEnrolmentRepository } from './repositories/student-enrolment.repository';
import { StudentRepository } from './repositories/student.repository';

@Injectable()
export class EnrolmentsService {
  constructor(
    private readonly enrolmentRepo: StudentEnrolmentRepository,
    private readonly studentRepo: StudentRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async listByStudent(studentId: string) {
    await this.assertStudentExists(studentId);
    return this.enrolmentRepo.findByStudentId(studentId);
  }

  async create(
    studentId: string,
    dto: CreateEnrolmentDto,
    actorPersonId: string,
  ) {
    await this.assertStudentExists(studentId);
    // Auto-assign the next free roll number in this section when the admin
    // doesn't type one in -- admission order, not something to track by hand.
    const rollNo =
      dto.rollNo ??
      (await this.enrolmentRepo.nextRollNo(dto.sectionId, dto.academicYearId));
    try {
      const created = await this.enrolmentRepo.create({
        studentId,
        academicYearId: dto.academicYearId,
        sectionId: dto.sectionId,
        rollNo,
        enrolmentType: dto.enrolmentType,
        remarks: dto.remarks,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'STUDENT_ENROLMENT_CREATED',
        objectType: 'student_enrolment',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This student already has an active enrolment for that academic year, or that roll number is already taken in this section.',
        );
      }
      throw err;
    }
  }

  /** Plain field edit -- roll no / status / outcome / remarks only. Never
   * touches section_id; see transferSection for that. */
  async update(id: string, dto: UpdateEnrolmentDto, actorPersonId: string) {
    const existing = await this.enrolmentRepo.findById(id);
    if (!existing) throw new NotFoundException('Enrolment not found');

    try {
      const updated = await this.enrolmentRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Enrolment not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STUDENT_ENROLMENT_UPDATED',
        objectType: 'student_enrolment',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'That roll number is already taken in this section.',
        );
      }
      throw err;
    }
  }

  /** A section transfer keeps the student's previous section as real history
   * instead of overwriting it: the old row is marked TRANSFERRED_SECTION (its
   * section_id/roll_no frozen as-is) and a new ACTIVE row is inserted for the
   * new section, atomically. This only works because student_enrolment's
   * uniqueness on (student_id, academic_year_id) is a partial index scoped to
   * status='ACTIVE' -- see query.md for that migration. Locks the old row first
   * so two concurrent transfer attempts on it can't both pass the ACTIVE check. */
  async transferSection(
    id: string,
    dto: TransferEnrolmentDto,
    actorPersonId: string,
  ) {
    return this.unitOfWork.run(async (client) => {
      const locked = await this.enrolmentRepo.findByIdForUpdate(id, client);
      if (!locked) throw new NotFoundException('Enrolment not found');
      if (locked.status !== 'ACTIVE') {
        throw new ConflictException(
          `This enrolment is ${locked.status.toLowerCase()}, not active -- it can't be transferred.`,
        );
      }
      if (dto.sectionId === locked.sectionId) {
        throw new ConflictException(
          "That is already this student's current section.",
        );
      }

      const rollNo =
        dto.rollNo ??
        (await this.enrolmentRepo.nextRollNo(
          dto.sectionId,
          locked.academicYearId,
          client,
        ));

      try {
        const superseded = await this.enrolmentRepo.supersede(
          id,
          dto.remarks ?? null,
          client,
        );
        const created = await this.enrolmentRepo.create(
          {
            studentId: locked.studentId,
            academicYearId: locked.academicYearId,
            sectionId: dto.sectionId,
            rollNo,
            enrolmentType: 'TRANSFER_IN',
            remarks: dto.remarks,
          },
          client,
        );

        await this.auditService.record(
          {
            actorPersonId,
            action: 'STUDENT_ENROLMENT_TRANSFERRED',
            objectType: 'student_enrolment',
            objectId: created.id,
            outcome: 'SUCCESS',
            beforeData: superseded,
            afterData: created,
          },
          client,
        );

        return created;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(
            'That roll number is already taken in the new section.',
          );
        }
        throw err;
      }
    });
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const student = await this.studentRepo.findById(studentId);
    if (!student) throw new NotFoundException('Student not found');
  }
}
