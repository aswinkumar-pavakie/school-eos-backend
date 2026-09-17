import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { HealthService } from './health.service';
import { ListInfirmaryVisitsQueryDto } from './dto/list-infirmary-visits.query.dto';
import { ListHealthAlertsQueryDto } from './dto/list-health-alerts.query.dto';

// Health & Infirmary -- read-only oversight for Admin/Principal/Vice
// Principal, same real data throughout (see health.repository.ts's own
// comment for why this stays read-only: the real data owner, HEALTH_INCHARGE,
// has no login built yet). Every method below is class-level, no write routes
// exist in this module at all.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('infirmary-visits')
  async listInfirmaryVisits(@Query() query: ListInfirmaryVisitsQueryDto) {
    return { data: await this.healthService.listInfirmaryVisits(query) };
  }

  @Get('alerts')
  async listAlerts(@Query() query: ListHealthAlertsQueryDto) {
    return { data: await this.healthService.listAlerts(query) };
  }

  @Get('escalations')
  async listEscalations(@Query('studentId') studentId?: string) {
    return { data: await this.healthService.listEscalations({ studentId }) };
  }

  @Get('students/:studentId/profile')
  async getStudentProfile(@Param('studentId') studentId: string) {
    const [profile, consents] = await Promise.all([
      this.healthService.getStudentProfile(studentId),
      this.healthService.getStudentConsents(studentId),
    ]);
    return { data: { profile, consents } };
  }
}
