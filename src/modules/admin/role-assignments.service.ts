import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PersonRepository } from '../identity/repositories/person.repository';
import { RoleAssignmentRepository } from '../identity/repositories/role-assignment.repository';
import { GrantRoleAssignmentDto } from './dto/grant-role-assignment.dto';
import { RoleAssignmentQueryDto } from './dto/role-assignment-query.dto';
import { RoleRepository } from './repositories/role.repository';
import { assertValidRoleScope, isUniqueViolation } from './scope-validation';

@Injectable()
export class RoleAssignmentsService {
  constructor(
    private readonly roleAssignmentRepo: RoleAssignmentRepository,
    private readonly personRepo: PersonRepository,
    private readonly roleRepo: RoleRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: RoleAssignmentQueryDto) {
    return this.roleAssignmentRepo.findMany(query);
  }

  async grant(dto: GrantRoleAssignmentDto, actorPersonId: string) {
    // Same rule as Create User: Admin grants every role except Admin itself.
    if (dto.roleCode === 'ADMIN') {
      throw new BadRequestException('The Admin role cannot be granted through this screen.');
    }

    const person = await this.personRepo.findById(dto.personId);
    if (!person) throw new NotFoundException('Person not found');

    const roleExists = await this.roleRepo.exists(dto.roleCode);
    if (!roleExists) throw new BadRequestException(`Unknown role_code: ${dto.roleCode}`);

    assertValidRoleScope(dto);

    try {
      const assignment = await this.roleAssignmentRepo.create({
        personId: dto.personId,
        roleCode: dto.roleCode,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        scopeStage: dto.scopeStage,
        academicYearId: dto.academicYearId,
        assignedBy: actorPersonId,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'ROLE_ASSIGNMENT_GRANTED',
        objectType: 'role_assignment',
        objectId: assignment.id,
        outcome: 'SUCCESS',
        afterData: assignment,
      });
      return assignment;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Covers both uq_role_assignment_active (this exact person+role+scope combo
        // is already active) and uq_single_instance_role (ADMIN/PRINCIPAL/
        // VICE_PRINCIPAL already has an active holder somewhere else).
        throw new ConflictException(
          'This role assignment already exists, or the role only permits one active holder at a time.',
        );
      }
      throw err;
    }
  }

  async revoke(id: string, actorPersonId: string) {
    const revoked = await this.roleAssignmentRepo.revoke(id, actorPersonId);
    if (!revoked) {
      throw new NotFoundException('Active role assignment not found (already revoked, or does not exist).');
    }
    await this.auditService.record({
      actorPersonId,
      action: 'ROLE_ASSIGNMENT_REVOKED',
      objectType: 'role_assignment',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: revoked,
    });
    return revoked;
  }
}
