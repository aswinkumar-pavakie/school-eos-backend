import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ARGON2_OPTIONS, generateTempPassword } from '../identity/identity.util';
import { AccountLinkRepository } from '../identity/repositories/account-link.repository';
import { SessionRepository } from '../identity/repositories/session.repository';
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
    private readonly sessionRepo: SessionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly linkRepo: AccountLinkRepository,
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

  /** Same pattern as StudentsService.getNextAdmissionNo() -- suggests the
   * next employee_no, but the field stays free-text/editable on the create
   * form (real HR numbers sometimes differ from this sequence). */
  async getNextEmployeeNo() {
    const maxSeq = await this.staffRepo.findMaxEmployeeSeq();
    const nextSeq = (maxSeq ?? 0) + 1;
    return { employeeNo: `EMP${String(nextSeq).padStart(4, '0')}` };
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
        departmentId: dto.departmentId ?? null,
        campusId: dto.campusId ?? null,
        bloodGroup: dto.bloodGroup ?? null,
        employmentType: dto.employmentType ?? null,
        staffRoom: dto.staffRoom ?? null,
        emergencyContactName: dto.emergencyContactName ?? null,
        emergencyContactPhone: dto.emergencyContactPhone ?? null,
        highestQualification: dto.highestQualification ?? null,
        specialization: dto.specialization ?? null,
        university: dto.university ?? null,
        yearOfGraduation: dto.yearOfGraduation ?? null,
        tetNetCleared: dto.tetNetCleared ?? null,
        areasOfExpertise: dto.areasOfExpertise ?? null,
        certifications: dto.certifications ?? null,
        workshopsTraining: dto.workshopsTraining ?? null,
        achievementsAwards: dto.achievementsAwards ?? null,
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
      // Leaving the school must actually end access: roles revoked, sessions and
      // push tokens gone, and any class seat released with its shared password
      // renewed (the leaver knows the old one). One transaction, so a failure
      // half-way leaves nothing half-exited.
      const seatLogins = await this.staffRepo.findHeldClassLogins(staff.personId);
      const renewals = await Promise.all(
        seatLogins.map(async (loginId) => {
          const plain = generateTempPassword();
          return { loginId, plain, hash: await argon2.hash(plain, ARGON2_OPTIONS) };
        }),
      );
      const updated = await this.unitOfWork.run(async (client) => {
        const row = await this.staffRepo.exit(id, dto.exitReason, dateOfExit, client);
        if (!row) return null;
        await this.staffRepo.releaseClassSeats(staff.personId, actorPersonId, client);
        // Linked-account switching: the leaver's own links, and every phone that had
        // one of their classes linked, are cut before their sessions are deleted.
        await this.linkRepo.revokeForOwner(staff.personId, 'STAFF_EXITED', null, client);
        for (const r of renewals) {
          await this.linkRepo.revokeForLinked(r.loginId, 'TEACHER_CHANGED', client);
          await this.userCredentialRepo.setSharedLoginPassword(r.loginId, r.hash, r.plain, client);
          await this.sessionRepo.deleteAllForPerson(r.loginId, client);
          await this.staffRepo.removeDeviceTokens(r.loginId, client);
        }
        await this.staffRepo.revokeAllRoles(staff.personId, actorPersonId, client);
        await this.sessionRepo.deleteAllForPerson(staff.personId, client);
        await this.staffRepo.removeDeviceTokens(staff.personId, client);
        return row;
      });
      if (!updated) throw new NotFoundException('Staff record not found');
      await this.auditService.record({
        actorPersonId,
        action: 'STAFF_EXITED',
        objectType: 'staff',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: staff,
        afterData: { ...updated, releasedClassLogins: seatLogins },
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
