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
import { ARGON2_OPTIONS } from '../identity/identity.util';
import { LoginIdentifierRepository } from '../identity/repositories/login-identifier.repository';
import { PersonRepository } from '../identity/repositories/person.repository';
import { RoleAssignmentRepository } from '../identity/repositories/role-assignment.repository';
import { UserCredentialRepository } from '../identity/repositories/user-credential.repository';
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
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

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

  /** Year rollover: moves an existing class-teacher login to a new academic
   * year's section row and (usually new) faculty holder. Rejects a
   * sectionId that doesn't share the login's original (grade, section_name)
   * identity -- this endpoint moves a holder, it never repoints a login to
   * a different class. */
  async reassign(
    loginPersonId: string,
    dto: ReassignClassTeacherDto,
    actorPersonId: string,
  ) {
    const login = await this.classTeacherLoginRepo.findById(loginPersonId);
    if (!login) throw new NotFoundException('Class Teacher login not found');

    const section = await this.sectionRepo.findById(dto.sectionId);
    if (!section) throw new NotFoundException('Section not found');

    if (section.gradeId !== login.gradeId || section.name !== login.sectionName) {
      throw new BadRequestException(
        `This login belongs to Grade/Section "${login.sectionName}", not "${section.name}". Create a new Class Teacher login for a different section instead.`,
      );
    }

    const faculty = await this.personRepo.findById(dto.facultyPersonId);
    if (!faculty) throw new NotFoundException('Faculty member not found');

    await this.unitOfWork.run(async (client) => {
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

      await this.auditService.record(
        {
          actorPersonId,
          action: 'CLASS_TEACHER_LOGIN_REASSIGNED',
          objectType: 'person',
          objectId: loginPersonId,
          outcome: 'SUCCESS',
          afterData: { assignment },
        },
        client,
      );
    });

    return { reassigned: true };
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
    const assignment =
      await this.classTeacherLoginRepo.findActiveAssignmentByFaculty(facultyPersonId);
    if (!assignment) return { hasClassTeacherLogin: false as const };
    return {
      hasClassTeacherLogin: true as const,
      gradeId: assignment.gradeId,
      sectionName: assignment.sectionName,
    };
  }
}
