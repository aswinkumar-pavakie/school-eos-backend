import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SchoolRepository } from './repositories/school.repository';
import { UpdateSchoolDto } from './dto/update-school.dto';

@Injectable()
export class SchoolService {
  constructor(
    private readonly schoolRepo: SchoolRepository,
    private readonly auditService: AuditService,
  ) {}

  async get() {
    const school = await this.schoolRepo.get();
    if (!school) throw new NotFoundException('School configuration not found');
    return school;
  }

  async update(dto: UpdateSchoolDto, actorPersonId: string) {
    const existing = await this.get();
    const updated = await this.schoolRepo.update(dto);
    await this.auditService.record({
      actorPersonId,
      action: 'SCHOOL_UPDATED',
      objectType: 'school',
      objectId: '1',
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
