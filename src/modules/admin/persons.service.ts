import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { personPhotoPublicUrl } from '../../infrastructure/storage/public-photo-url.util';
import {
  ARGON2_OPTIONS,
  generateTempPassword,
} from '../identity/identity.util';
import { LoginIdentifierRepository } from '../identity/repositories/login-identifier.repository';
import { PersonRepository } from '../identity/repositories/person.repository';
import { RoleAssignmentRepository } from '../identity/repositories/role-assignment.repository';
import { SessionRepository } from '../identity/repositories/session.repository';
import { UserCredentialRepository } from '../identity/repositories/user-credential.repository';
import { CreatePersonDto } from './dto/create-person.dto';
import { GeneralPasswordResetDto } from './dto/general-password-reset.dto';
import { PersonQueryDto } from './dto/person-query.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PHOTOS_BUCKET, photoObjectKeyFor } from './photo-storage.util';
import { RoleRepository } from './repositories/role.repository';
import { assertValidRoleScope, isUniqueViolation } from './scope-validation';

@Injectable()
export class PersonsService {
  constructor(
    private readonly personRepo: PersonRepository,
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
    private readonly roleAssignmentRepo: RoleAssignmentRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly roleRepo: RoleRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
  ) {}

  async list(query: PersonQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.personRepo.findMany({
      search: query.search,
      roleCode: query.roleCode,
      status: query.status,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(personId: string) {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundException('Person not found');
    const roleAssignments = await this.roleAssignmentRepo.findAllByPersonId(personId);
    return { person, roleAssignments };
  }

  async create(dto: CreatePersonDto, actorPersonId: string) {
    // "Admin creates every role except Admin itself" — stated in both the Design
    // Architecture doc and workflow.md's product boundary. There's no active Super
    // Admin login in this deployment to hand that off to, so it's simply not offered.
    if (dto.initialRole.roleCode === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be created through this screen.');
    }

    const roleExists = await this.roleRepo.exists(dto.initialRole.roleCode);
    if (!roleExists) {
      throw new BadRequestException(`Unknown role_code: ${dto.initialRole.roleCode}`);
    }
    assertValidRoleScope(dto.initialRole);

    const password = dto.initialPassword ?? generateTempPassword();
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    try {
      const result = await this.unitOfWork.run(async (client) => {
        const person = await this.personRepo.create(
          {
            firstName: dto.firstName,
            lastName: dto.lastName ?? null,
            gender: dto.gender ?? null,
            mobile: dto.identifierType === 'MOBILE' ? dto.identifierValue : null,
            email: dto.identifierType === 'EMAIL' ? dto.identifierValue : null,
            addressLine1: dto.addressLine1 ?? null,
            addressLine2: dto.addressLine2 ?? null,
            city: dto.city ?? null,
            state: dto.state ?? null,
            pincode: dto.pincode ?? null,
            createdBy: actorPersonId,
          },
          client,
        );

        await this.loginIdentifierRepo.create(
          person.id,
          dto.identifierType,
          dto.identifierValue,
          client,
        );
        await this.userCredentialRepo.createInitial(person.id, passwordHash, client);

        const roleAssignment = await this.roleAssignmentRepo.create(
          {
            personId: person.id,
            roleCode: dto.initialRole.roleCode,
            scopeType: dto.initialRole.scopeType,
            scopeId: dto.initialRole.scopeId,
            scopeStage: dto.initialRole.scopeStage,
            academicYearId: dto.initialRole.academicYearId,
            assignedBy: actorPersonId,
          },
          client,
        );

        await this.auditService.record(
          {
            actorPersonId,
            action: 'PERSON_CREATED',
            objectType: 'person',
            objectId: person.id,
            outcome: 'SUCCESS',
            afterData: person,
          },
          client,
        );

        return { person, roleAssignment };
      });

      return { ...result, temporaryPassword: password };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'An account with this email or mobile number already exists.',
        );
      }
      throw err;
    }
  }

  async update(personId: string, dto: UpdatePersonDto, actorPersonId: string) {
    const existing = await this.personRepo.findById(personId);
    if (!existing) throw new NotFoundException('Person not found');

    try {
      const updated = await this.personRepo.update(personId, dto, actorPersonId);
      if (!updated) throw new NotFoundException('Person not found');
      await this.auditService.record({
        actorPersonId,
        action: 'PERSON_UPDATED',
        objectType: 'person',
        objectId: personId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('An account with this email or mobile number already exists.');
      }
      throw err;
    }
  }

  async activate(personId: string, actorPersonId: string): Promise<void> {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundException('Person not found');
    await this.personRepo.updateStatus(personId, 'ACTIVE', actorPersonId);
    await this.auditService.record({
      actorPersonId,
      action: 'PERSON_ACTIVATED',
      objectType: 'person',
      objectId: personId,
      outcome: 'SUCCESS',
    });
  }

  async deactivate(personId: string, actorPersonId: string): Promise<void> {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundException('Person not found');
    await this.unitOfWork.run(async (client) => {
      await this.personRepo.updateStatus(personId, 'SUSPENDED', actorPersonId, client);
      // Deactivating an account that's mid-session shouldn't leave its existing
      // access tokens/sessions usable until they happen to expire naturally.
      await this.sessionRepo.deleteAllForPerson(personId, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'PERSON_DEACTIVATED',
          objectType: 'person',
          objectId: personId,
          outcome: 'SUCCESS',
        },
        client,
      );
    });
  }

  /** Admin-uploaded profile photo for any person (student, staff, parent, ...) --
   * the file itself was already written to disk by PersonsController's
   * FileInterceptor before this runs; here we just record the key and clean up
   * whatever photo it's replacing. */
  async uploadPhoto(personId: string, file: Express.Multer.File, actorPersonId: string) {
    const existing = await this.personRepo.findById(personId);
    if (!existing) throw new NotFoundException('Person not found');

    const photoObjectKey = photoObjectKeyFor(file);
    await this.storageService.upload(PHOTOS_BUCKET, photoObjectKey, file.buffer, file.mimetype);
    const updated = await this.personRepo.updatePhoto(personId, photoObjectKey, actorPersonId);
    if (existing.photoObjectKey) {
      await this.storageService.removeBestEffort(PHOTOS_BUCKET, existing.photoObjectKey);
    }
    await this.auditService.record({
      actorPersonId,
      action: 'PERSON_PHOTO_UPDATED',
      objectType: 'person',
      objectId: personId,
      outcome: 'SUCCESS',
      beforeData: { photoObjectKey: existing.photoObjectKey },
      afterData: { photoObjectKey },
    });
    return { photoUrl: personPhotoPublicUrl(updated!.photoObjectKey!) };
  }

  async removePhoto(personId: string, actorPersonId: string): Promise<void> {
    const existing = await this.personRepo.findById(personId);
    if (!existing) throw new NotFoundException('Person not found');
    if (!existing.photoObjectKey) return;
    await this.personRepo.updatePhoto(personId, null, actorPersonId);
    await this.storageService.removeBestEffort(PHOTOS_BUCKET, existing.photoObjectKey);
    await this.auditService.record({
      actorPersonId,
      action: 'PERSON_PHOTO_REMOVED',
      objectType: 'person',
      objectId: personId,
      outcome: 'SUCCESS',
      beforeData: { photoObjectKey: existing.photoObjectKey },
    });
  }

  async forceSignOut(personId: string, actorPersonId: string): Promise<void> {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundException('Person not found');
    await this.sessionRepo.deleteAllForPerson(personId);
    await this.auditService.record({
      actorPersonId,
      action: 'PERSON_FORCE_SIGNED_OUT',
      objectType: 'person',
      objectId: personId,
      outcome: 'SUCCESS',
    });
  }

  /**
   * General reset for any account. Only clears reset_allowance_used (re-opening
   * self-service) when the target actually holds an active PARENT role — see
   * UserCredentialRepository.generalPasswordReset's own comment for why.
   */
  async resetPassword(
    personId: string,
    dto: GeneralPasswordResetDto,
    actorPersonId: string,
  ): Promise<{ newPassword: string }> {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundException('Person not found');

    const activeRoles = await this.roleAssignmentRepo.findActiveByPersonId(personId);
    const isParent = activeRoles.some((r) => r.roleCode === 'PARENT');

    const password = dto.newPassword ?? generateTempPassword();
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    await this.unitOfWork.run(async (client) => {
      await this.userCredentialRepo.generalPasswordReset(personId, passwordHash, isParent, client);
      await this.sessionRepo.deleteAllForPerson(personId, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'PERSON_PASSWORD_RESET',
          objectType: 'person',
          objectId: personId,
          outcome: 'SUCCESS',
        },
        client,
      );
    });

    return { newPassword: password };
  }
}
