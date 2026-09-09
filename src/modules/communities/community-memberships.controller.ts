import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityMembershipsService } from './community-memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 17),
// and to COMMUNITY (Phase 4 of the separate standalone-Community-login
// initiative -- same read-only tier) -- every write method below keeps its
// own narrower @Roles('ADMIN') override.
// VICE_PRINCIPAL added (Vice Principal mobile Communities module) for the
// exact same read-only oversight scope as Principal, nothing more.
@Roles('ADMIN', 'PRINCIPAL', 'COMMUNITY', 'VICE_PRINCIPAL')
@Controller()
export class CommunityMembershipsController {
  constructor(
    private readonly membershipsService: CommunityMembershipsService,
  ) {}

  @Get('communities/:id/memberships')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.membershipsService.listByCommunity(id) };
  }

  @Post('communities/:id/memberships')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @Body() dto: CreateMembershipDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.membershipsService.create(id, dto, actor.personId),
    };
  }

  @Post('community-memberships/:membershipId/record-consent')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async recordConsent(
    @Param('membershipId') membershipId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.membershipsService.recordConsent(
        membershipId,
        actor.personId,
      ),
    };
  }

  @Post('community-memberships/:membershipId/remove')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('membershipId') membershipId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.membershipsService.remove(membershipId, actor.personId),
    };
  }
}
