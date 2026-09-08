import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { SchoolService } from './school.service';

// PRINCIPAL added (Phase 21) -- read-only: basic institutional identity info
// (name/board/address/contact), no doc callout needed since this carries no
// write/security risk, unlike Roles catalog/Document Retention/Terminals
// (left ADMIN-only -- genuine Configuration-tier, no leadership-oversight
// value, no doc authorization). PATCH stays ADMIN-only via the override below.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('school')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  @Get()
  async get() {
    return { data: await this.schoolService.get() };
  }

  @Roles('ADMIN')
  @Patch()
  async update(@Body() dto: UpdateSchoolDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.schoolService.update(dto, actor.personId) };
  }
}
