// Health & Infirmary -- health_profile, infirmary_visit, health_alert,
// medical_escalation, emergency_treatment_consent already existed live in the
// DB before this module -- pure application code, no schema changes.

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthRepository } from './repositories/health.repository';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRepository],
})
export class HealthModule {}
