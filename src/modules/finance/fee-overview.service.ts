import { Injectable } from '@nestjs/common';
import { FeeOverviewQueryDto } from './dto/fee-overview-query.dto';
import { FeeOverviewRepository } from './repositories/fee-overview.repository';

@Injectable()
export class FeeOverviewService {
  constructor(private readonly feeOverviewRepo: FeeOverviewRepository) {}

  get(query: FeeOverviewQueryDto) {
    return this.feeOverviewRepo.findOverviewCounts(query.academicYearId);
  }
}
