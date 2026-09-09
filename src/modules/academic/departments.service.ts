import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { DepartmentRepository } from './repositories/department.repository';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly departmentRepo: DepartmentRepository,
    private readonly auditService: AuditService,
  ) {}

  list() {
    return this.departmentRepo.findMany();
  }

  async get(id: string) {
    const department = await this.departmentRepo.findById(id);
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  async create(dto: CreateDepartmentDto, actorPersonId: string) {
    try {
      const created = await this.departmentRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'DEPARTMENT_CREATED',
        objectType: 'department',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A department with this name or code already exists.',
        );
      }
      if (isForeignKeyViolation(err))
        throw new ConflictException('hodStaffId does not exist.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateDepartmentDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.departmentRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Department not found');
      await this.auditService.record({
        actorPersonId,
        action: 'DEPARTMENT_UPDATED',
        objectType: 'department',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A department with this name or code already exists.',
        );
      }
      if (isForeignKeyViolation(err))
        throw new ConflictException('hodStaffId does not exist.');
      throw err;
    }
  }
}
