import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { LibraryAuditService } from './library-audit.service';

@Controller('library/audit')
@Roles('LIBRARY', 'ADMIN')
export class AuditController {
  constructor(private readonly auditService: LibraryAuditService) {}

  // Registered before ':id' -- otherwise "filters" would be swallowed as an id,
  // same precedent as members.controller.ts's own 'eligible'/'grades-lookup' routes.
  @Get('filters')
  async filters() {
    return { data: await this.auditService.filters() };
  }

  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    return this.auditService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.auditService.get(id) };
  }
}
