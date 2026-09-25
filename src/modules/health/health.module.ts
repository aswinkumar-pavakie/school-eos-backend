// Health & Infirmary -- health_profile, infirmary_visit, health_alert,
// medical_escalation, emergency_treatment_consent already existed live in the
// DB before this module -- pure application code, no schema changes.
//
// Two controllers over the same data: HealthController (read-only oversight for Admin /
// Principal / Vice Principal / Correspondent) and HealthInchargeController (the data
// owner's own console: record visits, keep profiles, acknowledge alerts, log contacts).

import { Module } from '@nestjs/common';
import { HealthInchargeController } from './health-incharge.controller';
import { HealthInchargeService } from './health-incharge.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthInchargeRepository } from './repositories/health-incharge.repository';
import { HealthRepository } from './repositories/health.repository';

@Module({
  controllers: [HealthController, HealthInchargeController],
  providers: [HealthService, HealthRepository, HealthInchargeService, HealthInchargeRepository],
})
export class HealthModule {}
