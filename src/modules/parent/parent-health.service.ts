import { ForbiddenException, Injectable } from '@nestjs/common';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentHealthRepository } from './repositories/parent-health.repository';

@Injectable()
export class ParentHealthService {
  constructor(
    private readonly healthRepo: ParentHealthRepository,
    private readonly guardianRepo: GuardianLinkRepository,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  async getOverview(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const [profile, visits] = await Promise.all([
      this.healthRepo.getProfile(studentId),
      this.healthRepo.findVisits(studentId),
    ]);
    return { profile, visits };
  }
}
