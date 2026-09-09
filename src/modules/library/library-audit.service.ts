import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { LibraryAuditLogRepository } from './repositories/library-audit-log.repository';

@Injectable()
export class LibraryAuditService {
  constructor(private readonly auditLogRepo: LibraryAuditLogRepository) {}

  async list(query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.auditLogRepo.findMany({
      action: query.action,
      objectType: query.objectType,
      actorPersonId: query.actorPersonId,
      startDate: query.startDate,
      endDate: query.endDate,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const entry = await this.auditLogRepo.findById(id);
    if (!entry) throw new NotFoundException('Audit entry not found');
    return entry;
  }

  filters() {
    return this.auditLogRepo.findFilterOptions();
  }
}
