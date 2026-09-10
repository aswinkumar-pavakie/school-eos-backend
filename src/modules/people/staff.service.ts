import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { LoginIdentifierRepository } from '../identity/repositories/login-identifier.repository';
import { PersonRepository } from '../identity/repositories/person.repository';
import { UserCredentialRepository } from '../identity/repositories/user-credential.repository';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffExitDto } from './dto/staff-exit.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { isCheckViolation, isUniqueViolation } from './pg-error.util';
import { StaffRepository } from './repositories/staff.repository';

@Injectable()
export class StaffService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly personRepo: PersonRepository,
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(query: StaffQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const ids = query.ids
      ? query.ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    // An explicit id selection must never be truncated by the default page
    // size -- it's a hand-picked set (e.g. checkbox selection), not a browse.
    const effectiveLimit = ids ? Math.max(ids.length, 1) : limit;
    const { rows, total } = await this.staffRepo.findMany({
      status: query.status,
      search: query.search,
      designation: query.designation,
      isTeaching:
        query.isTeaching === undefined
          ? undefined
          : query.isTeaching === 'true',
      gradeId: query.gradeId,
      sectionId: query.sectionId,
      subjectId: query.subjectId,
      ids,
      limit: effectiveLimit,
      offset: (page - 1) * effectiveLimit,
    });
    return { data: rows, meta: { page, limit: effectiveLimit, total } };
  }

  async listDesignations(isTeaching?: string) {
    const rows = await this.staffRepo.findDistinctDesignations(
      isTeaching === undefined ? undefined : isTeaching === 'true',
    );
    return { data: rows };
  }

  async get(id: string) {
    const staff = await this.staffRepo.findById(id);
    if (!staff) throw new NotFoundException('Staff record not found');

    // Same real login-credentials surface parents.service.ts's own get()
    // already exposes (loginIdentifiers + resetAllowanceUsed) -- Faculty is a
    // real login too (see CreateFacultyModal/createFacultyAction, POST
    // /persons then POST /staff), just never had this shown on its own
    // profile. resetAllowanceUsed only ever matters for a role with a
    // self-service reset allowance to begin with; Faculty has the same
    // forgot-password flow as Parent (identical /persons/:id/password-reset
    // admin action, already role-agnostic -- see PersonsService.resetPassword,
    // which clears the allowance whenever the target holds PARENT, and simply
    // leaves it alone otherwise). Reusing that field here just surfaces the
    // same already-real state Faculty's own credential row already tracks.
    const [loginIdentifiers, credential] = await Promise.all([
      this.loginIdentifierRepo.findByPersonId(staff.personId),
      this.userCredentialRepo.findByPersonId(staff.personId),
    ]);

    return {
      ...staff,
      loginIdentifiers,
      resetAllowanceUsed: credential?.resetAllowanceUsed ?? false,
      // Same field parents.service.ts's own get() exposes -- set only while
      // this is still the password Admin created/last reset for this faculty
      // member, cleared once they self-service their own change.
      adminVisiblePassword: credential?.adminVisiblePassword ?? null,
    };
  }

  /** The caller's OWN staff record, resolved from their authenticated
   * personId -- reuses the existing findByPersonId() repository method
   * (already used by parents.service.ts/guardian-link lookups), never a
   * client-supplied id. Used by Vice Principal's mobile Profile screen
   * (Phase 25); any authenticated staff member could equally call it. */
  async getMine(personId: string) {
    const staff = await this.staffRepo.findByPersonId(personId);
    if (!staff) throw new NotFoundException('No staff record is associated with this account');
    return staff;
  }

  async create(dto: CreateStaffDto, actorPersonId: string) {
    const person = await this.personRepo.findById(dto.personId);
    if (!person)
      throw new BadRequestException(
        'personId does not refer to an existing person.',
      );
    if (person.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot attach a staff record to a non-active person.',
      );
    }

    const existing = await this.staffRepo.findByPersonId(dto.personId);
    if (existing) {
      throw new ConflictException('This person already has a staff record.');
    }

    try {
      const created = await this.staffRepo.create({
        personId: dto.personId,
        employeeNo: dto.employeeNo,
        designation: dto.designation ?? null,
        teacherCategory: dto.teacherCategory ?? null,
        postType: dto.postType ?? null,
        stateTeacherId: dto.stateTeacherId ?? null,
        isTeaching: dto.isTeaching,
        dateOfJoining: dto.dateOfJoining,
        experienceYears: dto.experienceYears ?? null,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'STAFF_CREATED',
        objectType: 'staff',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('employee_no is already in use.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateStaffDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.staffRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Staff record not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STAFF_UPDATED',
        objectType: 'staff',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('employee_no is already in use.');
      }
      throw err;
    }
  }

  /** Atomic: status + date_of_exit + exit_reason all change together, matching the DB's
   * staff_exit_consistent CHECK. There is no path back off EXITED -- out of scope. */
  async exit(id: string, dto: StaffExitDto, actorPersonId: string) {
    const staff = await this.get(id);
    if (staff.status === 'EXITED') {
      throw new BadRequestException(
        'This staff record is already marked exited.',
      );
    }
    const dateOfExit = dto.dateOfExit ?? new Date().toISOString().slice(0, 10);
    try {
      const updated = await this.staffRepo.exit(id, dto.exitReason, dateOfExit);
      if (!updated) throw new NotFoundException('Staff record not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STAFF_EXITED',
        objectType: 'staff',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: staff,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isCheckViolation(err)) {
        throw new BadRequestException(
          'date_of_exit must be on or after date_of_joining.',
        );
      }
      throw err;
    }
  }
}
