// The real, general audit trail -- Design Architecture v0.1 module 20 (Settings,
// Master Data & Audit). AuditEventsController stays scoped to login events only
// (its own header comment says why); this is everything else.
// PRINCIPAL added (Phase 20) -- the approved API doc names "Restricted
// Admin/leadership/audit role" for the audit trail; nothing to narrow, this
// controller is a single GET.
import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Roles } from '../../common/auth/roles.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Roles('ADMIN', 'PRINCIPAL')
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const result = await this.auditService.query({
      actorPersonId: query.actorPersonId,
      objectType: query.objectType,
      objectId: query.objectId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit,
      offset: (page - 1) * limit,
    });

    return { data: result.rows, meta: { page, limit, total: result.total } };
  }
}
