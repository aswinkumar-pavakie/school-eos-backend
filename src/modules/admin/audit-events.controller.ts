// Login activity log — scoped to login events specifically. A general "every audit
// event of every kind" viewer belongs to Module 20 (Settings, Master Data & Audit),
// out of scope here.
// PRINCIPAL added (Phase 20) for backend-authorization correctness -- the
// approved API doc names this exact path (/audit-events) as "Restricted
// Admin/leadership/audit role". No Principal frontend page is built against
// this one specifically: Admin itself has no dedicated login-activity page
// either (only the general /admin/audit, backed by audit-log, has one), so
// building a Principal-only UI for it would exceed what even Admin has.
import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Roles } from '../../common/auth/roles.decorator';
import { AuditEventQueryDto } from './dto/audit-event-query.dto';

@Roles('ADMIN', 'PRINCIPAL')
@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: AuditEventQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const result = await this.auditService.query({
      actorPersonId: query.actorPersonId,
      action: ['LOGIN_SUCCESS', 'LOGIN_FAILURE'],
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit,
      offset: (page - 1) * limit,
    });

    return { data: result.rows, meta: { page, limit, total: result.total } };
  }
}
