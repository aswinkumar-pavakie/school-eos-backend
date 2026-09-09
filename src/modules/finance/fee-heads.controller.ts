// Read-only: write operations (create/update fee heads) are owned by the
// separate Finance/Accounts login being built independently -- this Admin view
// only needs to read them. Revisit once that module is in place.

import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { FeeHeadsService } from './fee-heads.service';

// PRINCIPAL added (Phase 16) -- same read-only oversight scope; 100% GET.
// VICE_PRINCIPAL added (Vice Principal mobile Finance module) for the exact
// same read-only oversight scope as Principal, nothing more.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('fee-heads')
export class FeeHeadsController {
  constructor(private readonly feeHeadsService: FeeHeadsService) {}

  @Get()
  async list() {
    return { data: await this.feeHeadsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.feeHeadsService.get(id) };
  }
}
