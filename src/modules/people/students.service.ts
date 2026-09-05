import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { PersonRepository } from '../identity/repositories/person.repository';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentLeaveDto } from './dto/student-leave.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { isCheckViolation, isUniqueViolation } from './pg-error.util';
import { StudentRepository } from './repositories/student.repository';

@Injectable()
export class StudentsService {
  constructor(
    private readonly studentRepo: StudentRepository,
    private readonly personRepo: PersonRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(query: StudentQueryDto) {
    const page = query.page ?? 1;
    const ids = query.ids
      ? query.ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    // An explicit id selection must never be truncated by the default page
    // size -- it's a hand-picked set (e.g. checkbox selection), not a browse.
    const limit = ids ? Math.max(ids.length, 1) : (query.limit ?? 50);
    const { rows, total } = await this.studentRepo.findMany({
      search: query.search,
      status: query.status,
      gradeId: query.gradeId,
      sectionId: query.sectionId,
      sectionName: query.sectionName,
      ids,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const student = await this.studentRepo.findById(id);
    if (!student) throw new NotFoundException('Student record not found');
    return student;
  }

  /** Students never log in, so there's no existing endpoint that creates a bare
   * person for one -- POST /persons always sets up login credentials + a role
   * assignment, which a student must never have. Person + student are created
   * together here, atomically (Person -> Student, the same dependency order
   * every other module in this build follows). */
  async create(dto: CreateStudentDto, actorPersonId: string) {
    if (!dto.mobile && !dto.email) {
      throw new BadRequestException('At least one of mobile or email is required.');
    }

    try {
      return await this.unitOfWork.run(async (client) => {
        const person = await this.personRepo.create(
          {
            firstName: dto.firstName,
            lastName: dto.lastName ?? null,
            dateOfBirth: dto.dateOfBirth ?? null,
            gender: dto.gender ?? null,
            mobile: dto.mobile ?? null,
            email: dto.email ?? null,
            addressLine1: dto.addressLine1 ?? null,
            addressLine2: dto.addressLine2 ?? null,
            city: dto.city ?? null,
            state: dto.state ?? null,
            pincode: dto.pincode ?? null,
            createdBy: actorPersonId,
          },
          client,
        );

        const created = await this.studentRepo.create(
          {
            personId: person.id,
            admissionNo: dto.admissionNo,
            stateStudentId: dto.stateStudentId ?? null,
            admissionDate: dto.admissionDate,
            mediumId: dto.mediumId ?? null,
            motherTongue: dto.motherTongue ?? null,
            languageSubjectChoice: dto.languageSubjectChoice ?? null,
            communityCategory: dto.communityCategory ?? null,
            isFirstGenLearner: dto.isFirstGenLearner,
            isDifferentlyAbled: dto.isDifferentlyAbled,
            supportNeeds: dto.supportNeeds ?? null,
            bloodGroup: dto.bloodGroup ?? null,
            isHosteller: dto.isHosteller,
            usesSchoolTransport: dto.usesSchoolTransport,
            commuteMode: dto.commuteMode ?? null,
            bankAccountRef: dto.bankAccountRef ?? null,
          },
          client,
        );

        await this.auditService.record(
          {
            actorPersonId,
            action: 'STUDENT_CREATED',
            objectType: 'student',
            objectId: created.id,
            outcome: 'SUCCESS',
            afterData: { person, student: created },
          },
          client,
        );

        return { ...created, person };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('admission_no or state_student_id is already in use.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateStudentDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.studentRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Student record not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STUDENT_UPDATED',
        objectType: 'student',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('admission_no or state_student_id is already in use.');
      }
      throw err;
    }
  }

  /** Atomic: status + date_of_leaving change together, matching the DB's
   * student_leaving_consistent CHECK. */
  async leave(id: string, dto: StudentLeaveDto, actorPersonId: string) {
    const student = await this.get(id);
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException('This student record is already in a left/archived state.');
    }
    const dateOfLeaving = dto.dateOfLeaving ?? new Date().toISOString().slice(0, 10);
    try {
      const updated = await this.studentRepo.leave(id, dto.status, dateOfLeaving);
      if (!updated) throw new NotFoundException('Student record not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STUDENT_LEFT',
        objectType: 'student',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: student,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException('date_of_leaving must be on or after admission_date.');
      }
      throw err;
    }
  }
}
