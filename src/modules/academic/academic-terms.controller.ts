import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { AcademicTermsService } from './academic-terms.service';

// Read-only, same role set as academic-years -- design-reframe addition, see
// academic-terms.service.ts for why this table is new. TRANSPORT_MANAGER
// added for the Transport Overview dashboard's own real "This term" tab.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
@Controller('academic-terms')
export class AcademicTermsController {
  constructor(private readonly academicTermsService: AcademicTermsService) {}

  @Get()
  async list(@Query('academicYearId') academicYearId?: string) {
    return { data: await this.academicTermsService.list(academicYearId) };
  }
}
