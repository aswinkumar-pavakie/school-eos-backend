// Shared by BookCopiesService.markLost/markDamaged and CirculationService's own
// mark-lost entry point -- both need to assess a LOST/DAMAGED fine the same way,
// and this is the one place that logic lives.

import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { LibraryFineRepository } from './repositories/library-fine.repository';

@Injectable()
export class LibraryFineAssessmentService {
  constructor(private readonly fineRepo: LibraryFineRepository) {}

  /** Must run inside the caller's own transaction (client already has the
   * relevant copy/issue rows locked). */
  async assessLossOrDamageFine(
    client: PoolClient,
    input: {
      issueId: string;
      memberId: string;
      reason: 'LOST' | 'DAMAGED';
      acquisitionCostPaise: string | null;
      assessedBy: string;
    },
  ) {
    if (!input.acquisitionCostPaise) {
      throw new BadRequestException(
        'This copy has no acquisition cost on record -- set one before marking it lost, so a fine amount can be calculated.',
      );
    }
    return this.fineRepo.create(
      {
        issueId: input.issueId,
        memberId: input.memberId,
        reason: input.reason,
        amountPaise: input.acquisitionCostPaise,
        assessedBy: input.assessedBy,
      },
      client,
    );
  }
}
