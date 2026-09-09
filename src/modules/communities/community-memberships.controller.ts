import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityMembershipsService } from './community-memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Roles('ADMIN')
@Controller()
export class CommunityMembershipsController {
  constructor(private readonly membershipsService: CommunityMembershipsService) {}

  @Get('communities/:id/memberships')
  async list(@Param('id') id: string) {
    return { data: await this.membershipsService.listByCommunity(id) };
  }

  @Post('communities/:id/memberships')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @Body() dto: CreateMembershipDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.membershipsService.create(id, dto, actor.personId) };
  }

  @Post('community-memberships/:membershipId/record-consent')
  @HttpCode(HttpStatus.OK)
  async recordConsent(@Param('membershipId') membershipId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.membershipsService.recordConsent(membershipId, actor.personId) };
  }

  @Post('community-memberships/:membershipId/remove')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('membershipId') membershipId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.membershipsService.remove(membershipId, actor.personId) };
  }
}
