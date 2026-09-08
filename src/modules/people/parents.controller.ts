import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentQueryDto } from './dto/parent-query.dto';
import { ParentsService } from './parents.service';

// Broadened to include PRINCIPAL for read-only oversight (Principal's own
// /principal/parents module), and to VICE_PRINCIPAL (Phase 5 mobile Parents
// module -- same read-only oversight need) -- no method-level override
// needed here, unlike students/concessions/etc., because this controller has
// no write endpoints at all (parent creation/contact-edit/activation/reset,
// and every guardian-link mutation -- set-primary, revoke, relationship edit
// -- all live on separate controllers this change doesn't touch, still
// ADMIN-only).
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get()
  async list(@Query() query: ParentQueryDto) {
    const result = await this.parentsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.parentsService.get(id) };
  }
}
