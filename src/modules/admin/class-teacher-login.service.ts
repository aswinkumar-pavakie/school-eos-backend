// Admin-facing service for the Class Teacher (Advisor) separate login --
// same "brand-new person + login_identifier + user_credential" shape as
// Academic Coordinator (persons.service.ts's createAcademicCoordinatorLogin),
// kept as its own service because this login is section-scoped and reused
// year over year (reassign), not owned for life by one faculty member the
// way a coordinator login is. See database/migrations/0032_class_teacher_login.sql
// for the full schema reasoning.

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
import { LoginIdentifierRepository } from '../identity/repositories/login-identifier.repository';
import { PersonRepository } from '../identity/repositories/person.repository';
import { RoleAssignmentRepository } from '../identity/repositories/role-assignment.repository';
import { AccountLinkRepository } from '../identity/repositories/account-link.repository';
import { SessionRepository } from '../identity/repositories/session.repository';
import { UserCredentialRepository } from '../identity/repositories/user-credential.repository';
import { PersonDeviceTokenRepository } from '../notifications/repositories/person-device-token.repository';
import { Queryable } from '../../infrastructure/postgres/postgres.service';
import { computeSeatStatus, type SeatStatus } from './class-teacher-seat-status.util';
import {
  ListClassLoginsQueryDto,
  RolloverClassLoginsDto,
  SetClassLoginPasswordDto,
} from './dto/class-login-admin.dto';
import { SectionRepository } from '../academic/repositories/section.repository';
import { StaffRepository } from '../people/repositories/staff.repository';
import { CreateClassTeacherLoginDto } from './dto/create-class-teacher-login.dto';
import { ReassignClassTeacherDto } from './dto/reassign-class-teacher.dto';
import { ClassTeacherLoginRepository } from './repositories/class-teacher-login.repository';
import { isUniqueViolation } from './scope-validation';

@Injectable()
export class ClassTeacherLoginService {
  constructor(
    private readonly personRepo: PersonRepository,
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
    private readonly roleAssignmentRepo: RoleAssignmentRepository,
    private readonly sectionRepo: SectionRepository,
    private readonly staffRepo: StaffRepository,
    private readonly classTeacherLoginRepo: ClassTeacherLoginRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly deviceTokenRepo: PersonDeviceTokenRepository,
    private readonly linkRepo: AccountLinkRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  /** A fresh shared password: hashed here (CPU-heavy, so always done BEFORE a
   * transaction opens) and kept in plain form only to store as the
   * admin-visible copy and show once to the admin. */
  private async makePassword(chosen?: string): Promise<{ plain: string; hash: string }> {
    const plain = chosen ?? generateTempPassword();
    return { plain, hash: await argon2.hash(plain, ARGON2_OPTIONS) };
  }

  /** Signs the login out everywhere; with `dropDevices` also stops the previous
   * holder's phone receiving its notifications. */
  private async cutOffAccess(
    loginPersonId: string,
    client: Queryable,
    dropDevices: boolean,
  ): Promise<void> {
    // Every phone that had this class linked loses the link (and its switched-in
    // sessions) first: the holder changed, or the password that proved the link did.
    await this.linkRepo.revokeForLinked(
      loginPersonId,
      dropDevices ? 'TEACHER_CHANGED' : 'CLASS_PASSWORD_RESET',
      client,
    );
    await this.sessionRepo.deleteAllForPerson(loginPersonId, client);
    if (dropDevices) await this.deviceTokenRepo.removeAllForPerson(loginPersonId, client);
  }

  private async requireLogin(loginPersonId: string) {
    const login = await this.classTeacherLoginRepo.findById(loginPersonId);
    if (!login) throw new NotFoundException('Class Teacher login not found');
    return login;
  }

  private async requireEligibleHolder(facultyPersonId: string): Promise<void> {
    const ok = await this.classTeacherLoginRepo.isEligibleFaculty(facultyPersonId);
    if (!ok) throw new BadRequestException('Selected person is not an active faculty member.');
  }

  async create(dto: CreateClassTeacherLoginDto, actorPersonId: string) {
    const section = await this.sectionRepo.findById(dto.sectionId);
    if (!section) throw new NotFoundException('Section not found');

    const faculty = await this.personRepo.findById(dto.facultyPersonId);
    if (!faculty) throw new NotFoundException('Faculty member not found');

    const existing = await this.classTeacherLoginRepo.findByGradeSection(
      section.gradeId,
      section.name,
    );
    if (existing) {
      throw new ConflictException(
        `A Class Teacher login already exists for Grade/Section "${section.name}". Use the reassign endpoint to move it to a new academic year's holder instead of creating a second login.`,
      );
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    try {
      const loginPerson = await this.unitOfWork.run(async (client) => {
        const loginPerson = await this.personRepo.create(
          {
            firstName: `Class Teacher`,
            lastName: `(${section.name})`,
            mobile: dto.identifierType === 'MOBILE' ? dto.identifierValue : null,
            email: dto.identifierType === 'EMAIL' ? dto.identifierValue : null,
            createdBy: actorPersonId,
          },
          client,
        );

        await this.loginIdentifierRepo.create(
          loginPerson.id,
          dto.identifierType,
          dto.identifierValue,
          client,
        );
        await this.userCredentialRepo.createInitial(
          loginPerson.id,
          passwordHash,
          dto.password,
          client,
        );
        // A shared login: no forced first-sign-in change, and "Forgot
        // password" must never rotate what the admin screen shows.
        await this.userCredentialRepo.markSharedLogin(loginPerson.id, client);

        // class-advisor.repository.ts's own advisor-sections lookup (the
        // single query every advisor-scoped screen -- attendance, class
        // results, student leave, the class-teacher detail screen itself --
        // ultimately depends on) requires the CLASS_ADVISOR holder to ALSO
        // have an ACTIVE `staff` row: `JOIN staff s ON s.person_id =
        // ra.person_id AND s.status = 'ACTIVE'`. Without this, the login
        // would authenticate fine but resolve to zero advisor sections
        // everywhere -- silently empty, not an error. isTeaching: false is
        // accurate, not just a default: this identity holds no
        // subject_offering assignments of its own (see faculty/class-hub's
        // own note on why "Subject Records"/"Timetable" are left off its
        // tile list for exactly this reason).
        await this.staffRepo.create(
          {
            personId: loginPerson.id,
            employeeNo: `CT-${loginPerson.id.slice(0, 8).toUpperCase()}`,
            designation: 'Class Teacher',
            isTeaching: false,
            dateOfJoining: new Date().toISOString().slice(0, 10),
          },
          client,
        );

        await this.classTeacherLoginRepo.create(
          {
            loginPersonId: loginPerson.id,
            gradeId: section.gradeId,
            sectionName: section.name,
            createdBy: actorPersonId,
          },
          client,
        );
        await this.roleAssignmentRepo.create(
          {
            personId: loginPerson.id,
            roleCode: 'CLASS_ADVISOR',
            scopeType: 'SECTION',
            scopeId: section.id,
            academicYearId: section.academicYearId,
            assignedBy: actorPersonId,
          },
          client,
        );
        await this.classTeacherLoginRepo.createAssignment(
          {
            classTeacherLoginId: loginPerson.id,
            academicYearId: section.academicYearId,
            sectionId: section.id,
            facultyPersonId: dto.facultyPersonId,
            assignedBy: actorPersonId,
          },
          client,
        );

        await this.auditService.record(
          {
            actorPersonId,
            action: 'CLASS_TEACHER_LOGIN_CREATED',
            objectType: 'person',
            objectId: loginPerson.id,
            outcome: 'SUCCESS',
            afterData: { loginPerson, section, facultyPersonId: dto.facultyPersonId },
          },
          client,
        );

        return loginPerson;
      });

      return { loginPersonId: loginPerson.id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'An account with this email or mobile number already exists.',
        );
      }
      throw err;
    }
  }

  /** Change the class teacher of a seat (also: fill a vacant seat, or move the
   * login onto a new academic year's section). Rejects a sectionId that doesn't
   * share the login's (grade, section_name) identity -- this moves a holder, it
   * never repoints a login to a different class.
   *
   * A hand-over always cuts the previous holder off: every session on the
   * login is deleted and its push devices removed, and (default) the shared
   * password is rotated so they cannot sign straight back in. The new password
   * is returned once; it also stays readable through revealPassword. */
  async reassign(
    loginPersonId: string,
    dto: ReassignClassTeacherDto,
    actorPersonId: string,
  ): Promise<{ reassigned: true; newPassword?: string }> {
    const login = await this.requireLogin(loginPersonId);

    const section = await this.sectionRepo.findById(dto.sectionId);
    if (!section) throw new NotFoundException('Section not found');

    if (section.gradeId !== login.gradeId || section.name !== login.sectionName) {
      throw new BadRequestException(
        `This login belongs to Grade/Section "${login.sectionName}", not "${section.name}". Create a new Class Teacher login for a different section instead.`,
      );
    }

    const faculty = await this.personRepo.findById(dto.facultyPersonId);
    if (!faculty) throw new NotFoundException('Faculty member not found');
    await this.requireEligibleHolder(dto.facultyPersonId);

    // One class per teacher: a teacher already holding a DIFFERENT class must be moved
    // off it first, so nobody ends up as class teacher of two classes at once.
    const held = await this.classTeacherLoginRepo.findActiveSeatHeldBy(dto.facultyPersonId);
    if (held && held.loginPersonId !== loginPersonId) {
      throw new ConflictException(
        `This teacher is already the class teacher of ${held.gradeName}-${held.sectionName}. A teacher can hold only one class -- change that class first.`,
      );
    }

    const current = await this.classTeacherLoginRepo.findActiveAssignment(loginPersonId);
    if (
      current &&
      current.facultyPersonId === dto.facultyPersonId &&
      current.sectionId === section.id
    ) {
      throw new ConflictException('This person is already the class teacher of this class.');
    }

    const next = dto.rotatePassword === false ? null : await this.makePassword();

    await this.unitOfWork.run(async (client) => {
      // Serialise concurrent changes to the same seat.
      if (!(await this.classTeacherLoginRepo.lockLogin(loginPersonId, client))) {
        throw new NotFoundException('Class Teacher login not found');
      }

      await this.classTeacherLoginRepo.endActiveAssignment(loginPersonId, client);

      // Revoke every currently-ACTIVE CLASS_ADVISOR role_assignment this
      // login holds before granting a new one -- role_assignment rows
      // aren't superseded automatically, and calling reassign() twice for
      // the same section_id (a same-year correction) would otherwise try to
      // grant a second ACTIVE row for the same section, tripping the
      // single-active-class-advisor-per-section invariant.
      const activeRoles = await this.roleAssignmentRepo.findMany(
        { personId: loginPersonId, roleCode: 'CLASS_ADVISOR', status: 'ACTIVE' },
        client,
      );
      for (const role of activeRoles) {
        await this.roleAssignmentRepo.revoke(role.id, actorPersonId, client);
      }

      await this.roleAssignmentRepo.create(
        {
          personId: loginPersonId,
          roleCode: 'CLASS_ADVISOR',
          scopeType: 'SECTION',
          scopeId: section.id,
          academicYearId: section.academicYearId,
          assignedBy: actorPersonId,
        },
        client,
      );
      const assignment = await this.classTeacherLoginRepo.createAssignment(
        {
          classTeacherLoginId: loginPersonId,
          academicYearId: section.academicYearId,
          sectionId: section.id,
          facultyPersonId: dto.facultyPersonId,
          assignedBy: actorPersonId,
        },
        client,
      );

      await this.cutOffAccess(loginPersonId, client, true);
      if (next) {
        await this.userCredentialRepo.setSharedLoginPassword(
          loginPersonId,
          next.hash,
          next.plain,
          client,
        );
      }

      await this.auditService.record(
        {
          actorPersonId,
          action: 'CLASS_TEACHER_LOGIN_REASSIGNED',
          objectType: 'person',
          objectId: loginPersonId,
          outcome: 'SUCCESS',
          afterData: {
            assignment,
            previousHolderPersonId: current?.facultyPersonId ?? null,
            passwordRotated: next !== null,
          },
        },
        client,
      );
    });

    return next ? { reassigned: true, newPassword: next.plain } : { reassigned: true };
  }

  /** Remove the class teacher and leave the seat vacant. The login stays (constant
   * identity), but nobody can use it: sessions and push devices are cut and the
   * password is rotated. */
  async vacate(loginPersonId: string, actorPersonId: string): Promise<{ vacated: true }> {
    await this.requireLogin(loginPersonId);
    const active = await this.classTeacherLoginRepo.findActiveAssignment(loginPersonId);
    if (!active) throw new ConflictException('This class has no class teacher to remove.');

    const next = await this.makePassword();
    await this.unitOfWork.run(async (client) => {
      if (!(await this.classTeacherLoginRepo.lockLogin(loginPersonId, client))) {
        throw new NotFoundException('Class Teacher login not found');
      }
      await this.classTeacherLoginRepo.endActiveAssignment(loginPersonId, client);
      await this.cutOffAccess(loginPersonId, client, true);
      await this.userCredentialRepo.setSharedLoginPassword(loginPersonId, next.hash, next.plain, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'CLASS_LOGIN_VACATED',
          objectType: 'person',
          objectId: loginPersonId,
          outcome: 'SUCCESS',
          afterData: { previousHolderPersonId: active.facultyPersonId },
        },
        client,
      );
    });
    return { vacated: true };
  }

  /** Admin sets (or generates) the shared password. Signs the login out
   * everywhere; unlike the generic person reset it never forces a change and
   * never re-opens self-service reset. */
  async setPassword(
    loginPersonId: string,
    dto: SetClassLoginPasswordDto,
    actorPersonId: string,
  ): Promise<{ newPassword: string }> {
    await this.requireLogin(loginPersonId);
    const next = await this.makePassword(dto.newPassword);
    await this.unitOfWork.run(async (client) => {
      await this.userCredentialRepo.setSharedLoginPassword(loginPersonId, next.hash, next.plain, client);
      await this.cutOffAccess(loginPersonId, client, false);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'CLASS_LOGIN_PASSWORD_RESET',
          objectType: 'person',
          objectId: loginPersonId,
          outcome: 'SUCCESS',
        },
        client,
      );
    });
    return { newPassword: next.plain };
  }

  /** Returns the current shared password -- and records that the admin looked.
   * A POST, not a GET: reading a secret is an action that must be logged. */
  async revealPassword(
    loginPersonId: string,
    actorPersonId: string,
  ): Promise<{ password: string }> {
    await this.requireLogin(loginPersonId);
    const password = await this.classTeacherLoginRepo.readStoredPassword(loginPersonId);
    if (!password) {
      throw new ConflictException(
        'No readable password is stored for this login. Reset it to set a new one.',
      );
    }
    await this.auditService.record({
      actorPersonId,
      action: 'CLASS_LOGIN_PASSWORD_REVEALED',
      objectType: 'person',
      objectId: loginPersonId,
      outcome: 'SUCCESS',
    });
    return { password };
  }

  private async resolveYear(academicYearId?: string) {
    const year = academicYearId
      ? await this.classTeacherLoginRepo.findAcademicYear(academicYearId)
      : await this.classTeacherLoginRepo.findCurrentAcademicYear();
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  /** The admin seat table: every class login with its holder, how many students
   * it has in the selected year, and a status. Never includes a password. */
  async list(query: ListClassLoginsQueryDto) {
    const year = await this.resolveYear(query.academicYearId);
    const [rows, sectionsWithoutLogin] = await Promise.all([
      this.classTeacherLoginRepo.listSeats(year.id),
      this.classTeacherLoginRepo.listSectionsWithoutLogin(year.id),
    ]);

    const seats = rows.map((r) => ({
      ...r,
      status: computeSeatStatus({
        hasHolder: r.holderPersonId !== null,
        holderStaffStatus: r.holderStaffStatus,
        targetSectionId: r.targetSectionId,
        roleSectionId: r.roleSectionId,
      }),
    }));

    const count = (s: SeatStatus) => seats.filter((x) => x.status === s).length;
    return {
      academicYear: year,
      summary: {
        total: seats.length,
        active: count('ACTIVE'),
        vacant: count('VACANT'),
        needsRollover: count('NEEDS_ROLLOVER'),
        noSectionThisYear: count('NO_SECTION_THIS_YEAR'),
        holderInactive: count('HOLDER_INACTIVE'),
      },
      seats,
      sectionsWithoutLogin,
    };
  }

  /** Read-only roster of the students this login sees in a year. The mapping is
   * never edited by hand: it is that year's enrolments in the login's section. */
  async students(loginPersonId: string, academicYearId?: string) {
    await this.requireLogin(loginPersonId);
    const year = await this.resolveYear(academicYearId);
    const sectionId = await this.classTeacherLoginRepo.findSectionForLoginInYear(loginPersonId, year.id);
    if (!sectionId) return { academicYear: year, sectionId: null, students: [] };
    return {
      academicYear: year,
      sectionId,
      students: await this.classTeacherLoginRepo.listStudents(sectionId),
    };
  }

  /** What a rollover into `targetAcademicYearId` would do -- nothing is changed. */
  async rolloverPreview(targetAcademicYearId: string, overrides: { loginPersonId: string; facultyPersonId: string }[] = []) {
    const year = await this.resolveYear(targetAcademicYearId);
    const [rows, sectionsWithoutLogin] = await Promise.all([
      this.classTeacherLoginRepo.listSeats(year.id),
      this.classTeacherLoginRepo.listSectionsWithoutLogin(year.id),
    ]);
    const overrideBy = new Map(overrides.map((o) => [o.loginPersonId, o.facultyPersonId]));

    const items = rows.map((r) => {
      const override = overrideBy.get(r.loginPersonId) ?? null;
      const holderChanges = override !== null && override !== r.holderPersonId;
      const nextHolder = override ?? r.holderPersonId;
      let action: 'MOVE' | 'ALREADY_ALIGNED' | 'SKIP_NO_SECTION';
      if (!r.targetSectionId) action = 'SKIP_NO_SECTION';
      else if (r.roleSectionId === r.targetSectionId && !holderChanges) action = 'ALREADY_ALIGNED';
      else action = 'MOVE';
      return {
        loginPersonId: r.loginPersonId,
        gradeName: r.gradeName,
        sectionName: r.sectionName,
        email: r.email,
        currentHolderPersonId: r.holderPersonId,
        currentHolderName: r.holderName,
        nextHolderPersonId: nextHolder,
        holderChanges,
        fromSectionId: r.roleSectionId,
        toSectionId: r.targetSectionId,
        studentCount: r.studentCount,
        action,
        // Move only: no teacher to attach -- the seat stays vacant.
        staysVacant: action === 'MOVE' && nextHolder === null,
      };
    });

    const count = (a: string) => items.filter((i) => i.action === a).length;
    return {
      academicYear: year,
      summary: {
        toMove: count('MOVE'),
        alreadyAligned: count('ALREADY_ALIGNED'),
        noSectionThisYear: count('SKIP_NO_SECTION'),
        staysVacant: items.filter((i) => i.staysVacant).length,
        sectionsWithoutLogin: sectionsWithoutLogin.length,
      },
      items,
      sectionsWithoutLogin,
    };
  }

  /** Moves every class login onto the target year's sections in ONE transaction:
   * all seats move, or none do. By default each seat keeps its teacher and its
   * password; a seat whose teacher changes (override) is treated exactly like a
   * hand-over (password rotated, previous holder cut off). Safe to re-run: seats
   * that are already aligned are skipped. */
  async rolloverApply(dto: RolloverClassLoginsDto, actorPersonId: string) {
    const overrides = dto.overrides ?? [];
    const preview = await this.rolloverPreview(dto.targetAcademicYearId, overrides);
    const toMove = preview.items.filter((i) => i.action === 'MOVE');

    // Validate every new teacher up front so a bad one fails before any change.
    for (const facultyId of new Set(overrides.map((o) => o.facultyPersonId))) {
      await this.requireEligibleHolder(facultyId);
    }

    // Hash outside the transaction (argon2 is CPU-heavy).
    const passwords = new Map<string, { plain: string; hash: string }>();
    for (const item of toMove) {
      if (dto.rotatePasswords === true || item.holderChanges) {
        passwords.set(item.loginPersonId, await this.makePassword());
      }
    }

    let moved = 0;
    await this.unitOfWork.run(async (client) => {
      for (const item of toMove) {
        if (!(await this.classTeacherLoginRepo.lockLogin(item.loginPersonId, client))) continue;
        if (!item.toSectionId) continue;

        await this.classTeacherLoginRepo.endActiveAssignment(item.loginPersonId, client);
        const activeRoles = await this.roleAssignmentRepo.findMany(
          { personId: item.loginPersonId, roleCode: 'CLASS_ADVISOR', status: 'ACTIVE' },
          client,
        );
        for (const role of activeRoles) {
          await this.roleAssignmentRepo.revoke(role.id, actorPersonId, client);
        }
        await this.roleAssignmentRepo.create(
          {
            personId: item.loginPersonId,
            roleCode: 'CLASS_ADVISOR',
            scopeType: 'SECTION',
            scopeId: item.toSectionId,
            academicYearId: preview.academicYear.id,
            assignedBy: actorPersonId,
          },
          client,
        );
        if (item.nextHolderPersonId) {
          await this.classTeacherLoginRepo.createAssignment(
            {
              classTeacherLoginId: item.loginPersonId,
              academicYearId: preview.academicYear.id,
              sectionId: item.toSectionId,
              facultyPersonId: item.nextHolderPersonId,
              assignedBy: actorPersonId,
            },
            client,
          );
        }

        const next = passwords.get(item.loginPersonId);
        if (next) {
          await this.userCredentialRepo.setSharedLoginPassword(item.loginPersonId, next.hash, next.plain, client);
          await this.cutOffAccess(item.loginPersonId, client, item.holderChanges);
        }

        await this.auditService.record(
          {
            actorPersonId,
            action: 'CLASS_LOGIN_ROLLED_OVER',
            objectType: 'person',
            objectId: item.loginPersonId,
            outcome: 'SUCCESS',
            afterData: {
              toSectionId: item.toSectionId,
              previousHolderPersonId: item.currentHolderPersonId,
              holderPersonId: item.nextHolderPersonId,
              passwordRotated: next !== undefined,
            },
          },
          client,
        );
        moved++;
      }
    });

    return {
      academicYear: preview.academicYear,
      moved,
      alreadyAligned: preview.summary.alreadyAligned,
      noSectionThisYear: preview.summary.noSectionThisYear,
      staysVacant: preview.summary.staysVacant,
      sectionsWithoutLogin: preview.summary.sectionsWithoutLogin,
    };
  }

  async getHistory(loginPersonId: string) {
    const login = await this.classTeacherLoginRepo.findById(loginPersonId);
    if (!login) throw new NotFoundException('Class Teacher login not found');
    return { login, history: await this.classTeacherLoginRepo.listHistory(loginPersonId) };
  }

  async findByGradeSection(gradeId: string, sectionName: string) {
    return this.classTeacherLoginRepo.findByGradeSection(gradeId, sectionName);
  }

  /** Faculty's own "do I currently have a Class Teacher login to switch
   * into?" check -- never returns the password; Admin communicates that to
   * the faculty member out of band, same as the Academic Coordinator login. */
  async getFacultyClassTeacherLink(facultyPersonId: string) {
    const classes = await this.classTeacherLoginRepo.findActiveClassLoginsByFaculty(facultyPersonId);
    const first = classes[0];
    if (!first) return { hasClassTeacherLogin: false as const };
    return {
      hasClassTeacherLogin: true as const,
      gradeId: first.gradeId,
      sectionName: first.sectionName,
      classes,
    };
  }

  /** Admin cut-off for one class: every phone that added this class account loses the
   * link (and any switched-in session). The holder re-adds once on their own phone. */
  async revokeLinks(loginPersonId: string, actorPersonId: string): Promise<{ revoked: number }> {
    await this.requireLogin(loginPersonId);
    const revoked = await this.linkRepo.revokeForLinked(loginPersonId, 'ADMIN_REVOKED');
    await this.auditService.record({
      actorPersonId,
      action: 'ACCOUNT_LINK_REVOKED',
      objectType: 'person',
      objectId: loginPersonId,
      outcome: 'SUCCESS',
      afterData: { reason: 'ADMIN_REVOKED', revoked },
    });
    return { revoked };
  }
}
