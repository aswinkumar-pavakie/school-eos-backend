import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { FeeDemandQueryDto } from './dto/fee-demand-query.dto';
import { FeeDemandsService } from './fee-demands.service';

// Admin's read-only "which students have pending/outstanding/overdue fees"
// list -- Admin -> Finance section 3. No create/update/delete here -- Finance
// owns fee_demand's actual lifecycle (collection, waivers, cancellation).
// PRINCIPAL added (Phase 16) -- same read-only oversight scope; 100% GET.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('fee-demands')
export class FeeDemandsController {
  constructor(private readonly feeDemandsService: FeeDemandsService) {}

  @Get()
  async list(@Query() query: FeeDemandQueryDto) {
    return await this.feeDemandsService.list(query);
  }
}
