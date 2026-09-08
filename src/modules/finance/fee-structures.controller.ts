// Read-only: write operations (create/update/publish/supersede structures,
// add/edit/remove lines) are owned by the separate Finance/Accounts login
// being built independently -- this Admin view only needs to read them.
// Revisit once that module is in place.

import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { FeeStructureQueryDto } from './dto/fee-structure-query.dto';
import { FeeStructuresService } from './fee-structures.service';

// PRINCIPAL added (Phase 16) -- same read-only oversight scope; 100% GET.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class FeeStructuresController {
  constructor(private readonly feeStructuresService: FeeStructuresService) {}

  @Get('fee-structures')
  async list(@Query() query: FeeStructureQueryDto) {
    return { data: await this.feeStructuresService.list(query) };
  }

  @Get('fee-structures/:id')
  async get(@Param('id') id: string) {
    return { data: await this.feeStructuresService.get(id) };
  }

  @Get('fee-structures/:id/lines')
  async listLines(@Param('id') id: string) {
    return { data: await this.feeStructuresService.listLines(id) };
  }
}
