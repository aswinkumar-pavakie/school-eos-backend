import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { LibraryOverviewService } from './library-overview.service';

// PRINCIPAL added (Phase 14) -- same read-only oversight scope Admin already
// has here (see admin/library/page.tsx's own comment: this overview endpoint
// is deliberately the ONLY Library surface Admin's oversight page calls).
// VICE_PRINCIPAL added (Vice Principal mobile Library module) for the exact
// same reason -- same oversight tier as Principal, nothing more.
// Every other Library controller (books, members, circulation, reservations,
// fines, lost-damaged, reports, config, audit) is intentionally left
// untouched -- Admin doesn't get a frontend for those either, so neither
// Principal nor Vice Principal should; there is no method-level write here
// to narrow, this controller only ever had the one read.
@Controller('library/overview')
@Roles('LIBRARY', 'ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
export class LibraryOverviewController {
  constructor(private readonly overviewService: LibraryOverviewService) {}

  @Get()
  async get() {
    return { data: await this.overviewService.get() };
  }
}
