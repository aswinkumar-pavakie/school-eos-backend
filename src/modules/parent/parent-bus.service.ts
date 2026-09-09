import { ForbiddenException, Injectable } from '@nestjs/common';
import { ParentBusRepository } from './repositories/parent-bus.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';

@Injectable()
export class ParentBusService {
  constructor(
    private readonly busRepo: ParentBusRepository,
    private readonly guardianRepo: GuardianLinkRepository,
  ) {}

  async getAllocation(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
    return this.busRepo.findAllocationForStudent(studentId);
  }
}
