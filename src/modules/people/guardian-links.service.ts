import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { PersonRepository } from '../identity/repositories/person.repository';
import { CreateGuardianLinkDto } from './dto/create-guardian-link.dto';
import { UpdateGuardianLinkDto } from './dto/update-guardian-link.dto';
import { constraintName, isUniqueViolation } from './pg-error.util';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { StudentRepository } from './repositories/student.repository';

@Injectable()
export class GuardianLinksService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly studentRepo: StudentRepository,
    private readonly personRepo: PersonRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly auditService: AuditService,
  ) {}

  async listByStudent(studentId: string) {
    await this.assertStudentExists(studentId);
    return this.guardianLinkRepo.findByStudentId(studentId);
  }

  async create(studentId: string, dto: CreateGuardianLinkDto, actorPersonId: string) {
    await this.assertStudentExists(studentId);
    const guardianPerson = await this.personRepo.findById(dto.personId);
    if (!guardianPerson) {
      throw new BadRequestException('personId does not refer to an existing person.');
    }

    // A student can have at most one ACTIVE FATHER and one ACTIVE MOTHER --
    // a second, different person claiming the same parent role for the same
    // child is almost always a data-entry mistake, not a real second parent.
    // Other relationships (GUARDIAN, GRANDPARENT, SIBLING, OTHER) aren't
    // restricted this way since a student can genuinely have several of those.
    if (dto.relationship === 'FATHER' || dto.relationship === 'MOTHER') {
      const existingLinks = await this.guardianLinkRepo.findByStudentId(studentId);
      const conflicting = existingLinks.find(
        (link) =>
          link.status === 'ACTIVE' &&
          link.relationship === dto.relationship &&
          link.personId !== dto.personId,
      );
      if (conflicting) {
        throw new ConflictException(
          `This student already has an active ${dto.relationship.toLowerCase()} on file (${conflicting.firstName} ${conflicting.lastName ?? ''}). Revoke that link first if this is a correction.`,
        );
      }
    }

    const create = () =>
      this.guardianLinkRepo.create({
        studentId,
        personId: dto.personId,
        relationship: dto.relationship,
        isPrimaryContact: dto.isPrimaryContact,
        accessLevel: dto.accessLevel,
        isAuthorisedPickup: dto.isAuthorisedPickup,
        occupation: dto.occupation ?? null,
        annualIncomePaise: dto.annualIncomePaise,
      });

    try {
      let created;
      if (dto.isPrimaryContact) {
        // Atomic: clear any other ACTIVE primary contact for this student before
        // inserting the new one, so the partial-unique index on
        // (student_id WHERE is_primary_contact AND status='ACTIVE') never sees two.
        created = await this.unitOfWork.run(async (client) => {
          await this.guardianLinkRepo.clearPrimaryForStudent(studentId, client);
          const link = await this.guardianLinkRepo.create(
            {
              studentId,
              personId: dto.personId,
              relationship: dto.relationship,
              isPrimaryContact: true,
              accessLevel: dto.accessLevel,
              isAuthorisedPickup: dto.isAuthorisedPickup,
              occupation: dto.occupation ?? null,
              annualIncomePaise: dto.annualIncomePaise,
            },
            client,
          );
          await this.auditService.record(
            {
              actorPersonId,
              action: 'GUARDIAN_LINK_CREATED',
              objectType: 'guardian_link',
              objectId: link.id,
              outcome: 'SUCCESS',
              afterData: link,
            },
            client,
          );
          return link;
        });
      } else {
        created = await create();
        await this.auditService.record({
          actorPersonId,
          action: 'GUARDIAN_LINK_CREATED',
          objectType: 'guardian_link',
          objectId: created.id,
          outcome: 'SUCCESS',
          afterData: created,
        });
      }
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        if (constraintName(err) === 'uq_guardian_single_parent_role') {
          throw new ConflictException(
            'This student already has an active guardian with that relationship (father/mother). Revoke the existing link first if this is a correction.',
          );
        }
        throw new ConflictException('This person is already linked to this student as a guardian.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateGuardianLinkDto, actorPersonId: string) {
    const existing = await this.guardianLinkRepo.findById(id);
    if (!existing) throw new NotFoundException('Guardian link not found');

    if (
      (dto.relationship === 'FATHER' || dto.relationship === 'MOTHER') &&
      dto.relationship !== existing.relationship &&
      existing.status === 'ACTIVE'
    ) {
      const siblingLinks = await this.guardianLinkRepo.findByStudentId(existing.studentId);
      const conflicting = siblingLinks.find(
        (link) => link.id !== id && link.status === 'ACTIVE' && link.relationship === dto.relationship,
      );
      if (conflicting) {
        throw new ConflictException(
          `This student already has an active ${dto.relationship.toLowerCase()} on file (${conflicting.firstName} ${conflicting.lastName ?? ''}). Revoke that link first if this is a correction.`,
        );
      }
    }

    let updated;
    try {
      updated = await this.guardianLinkRepo.update(id, dto);
    } catch (err) {
      if (isUniqueViolation(err) && constraintName(err) === 'uq_guardian_single_parent_role') {
        throw new ConflictException(
          'This student already has an active guardian with that relationship (father/mother). Revoke the existing link first if this is a correction.',
        );
      }
      throw err;
    }
    await this.auditService.record({
      actorPersonId,
      action: 'GUARDIAN_LINK_UPDATED',
      objectType: 'guardian_link',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  /** Atomic set-primary, mirroring the academic module's set-current/set-primary
   * pattern: unset any other ACTIVE primary contact for this student, then set this one,
   * inside one transaction. */
  async setPrimary(id: string, actorPersonId: string) {
    const existing = await this.guardianLinkRepo.findById(id);
    if (!existing) throw new NotFoundException('Guardian link not found');
    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot make a revoked guardian link the primary contact.');
    }
    return this.unitOfWork.run(async (client) => {
      await this.guardianLinkRepo.clearPrimaryForStudent(existing.studentId, client);
      const updated = await this.guardianLinkRepo.setPrimary(id, client);
      await this.auditService.record(
        {
          actorPersonId,
          action: 'GUARDIAN_LINK_PRIMARY_SET',
          objectType: 'guardian_link',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: updated,
        },
        client,
      );
      return updated;
    });
  }

  async revoke(id: string, actorPersonId: string) {
    const existing = await this.guardianLinkRepo.findById(id);
    if (!existing) throw new NotFoundException('Guardian link not found');
    const updated = await this.guardianLinkRepo.revoke(id);
    await this.auditService.record({
      actorPersonId,
      action: 'GUARDIAN_LINK_REVOKED',
      objectType: 'guardian_link',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const student = await this.studentRepo.findById(studentId);
    if (!student) throw new NotFoundException('Student not found');
  }
}
