import { Injectable } from '@nestjs/common';
import { HealthRepository } from './repositories/health.repository';

@Injectable()
export class HealthService {
  constructor(private readonly healthRepo: HealthRepository) {}

  getStudentProfile(studentId: string) {
    return this.healthRepo.findProfileByStudentId(studentId);
  }

  getStudentConsents(studentId: string) {
    return this.healthRepo.findConsentsByStudentId(studentId);
  }

  listInfirmaryVisits(filter: { studentId?: string; action?: string }) {
    return this.healthRepo.findInfirmaryVisits(filter);
  }

  listAlerts(filter: { acknowledged?: boolean }) {
    return this.healthRepo.findAlerts(filter);
  }

  listEscalations(filter: { studentId?: string }) {
    return this.healthRepo.findEscalations(filter);
  }
}
