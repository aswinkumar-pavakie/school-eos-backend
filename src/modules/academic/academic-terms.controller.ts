import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { AcademicTermsService } from './academic-terms.service';

// Read-only, same role set as academic-years -- design-reframe addition, see
// academic-terms.service.ts for why this table is new. TRANSPORT_MANAGER
// added for the Transport Overview dashboard's own real "This term" tab.
// SPORTS_ADMIN added for the Achievements screen's real "Term" filter --
// derived client-side from each term's real start/end date against the
// achievement's real awardedOn date, no achievement.term_id column needed.
// FACULTY added for the Faculty dashboard's own real "This term" tab --
// same derive-from-real-dates pattern, no faculty-specific term data needed.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER', 'SPORTS_ADMIN', 'FACULTY')
@Controller('academic-terms')
export class AcademicTermsController {
  constructor(private readonly academicTermsService: AcademicTermsService) {}

  @Get()
  async list(@Query('academicYearId') academicYearId?: string) {
    return { data: await this.academicTermsService.list(academicYearId) };
  }
}
