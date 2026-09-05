import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { FeeOverviewQueryDto } from './dto/fee-overview-query.dto';
import { FeeOverviewService } from './fee-overview.service';

// Admin's read-only Fee Overview -- Admin -> Finance section 1. Every figure
// comes straight out of fee_demand.state; there is no write path here at all.
@Roles('ADMIN')
@Controller('fee-overview')
export class FeeOverviewController {
  constructor(private readonly feeOverviewService: FeeOverviewService) {}

  @Get()
  async get(@Query() query: FeeOverviewQueryDto) {
    return { data: await this.feeOverviewService.get(query) };
  }
}
