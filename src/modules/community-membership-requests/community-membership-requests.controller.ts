import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityMembershipRequestsService } from './community-membership-requests.service';
import { CreateAddMembershipRequestDto } from './dto/create-add-membership-request.dto';
import { CreateRemoveMembershipRequestDto } from './dto/create-remove-membership-request.dto';

// Community-only, end to end -- same shape as community-proposals.controller.ts.
// Principal decides via the existing generic /approvals/:id/approve|reject
// endpoints -- no duplicate decision endpoint here. Admin's own direct
// add/remove-member endpoints (community-memberships.controller.ts) are
// untouched: this is an ADDITIONAL, approval-gated path Community can use for
// its own community, not a replacement for Admin's direct authority.
@Roles('COMMUNITY')
@Controller('community-membership-requests')
export class CommunityMembershipRequestsController {
  constructor(private readonly service: CommunityMembershipRequestsService) {}

  // Narrow, Community-scoped student search -- deliberately NOT a broadened
  // role on the general Students module's own /students?search= endpoint
  // (that would hand Community the full Student Directory's authorization
  // surface). Returns the same minimal fields StudentPersonPicker already
  // uses elsewhere (id, name, admissionNo) -- nothing else.
  @Get('student-search')
  async searchStudents(
    @Query('search') search: string | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.searchStudents(search ?? '', actor) };
  }

  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  async createAdd(
    @Body() dto: CreateAddMembershipRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createAddRequest(dto, actor) };
  }

  @Post('remove')
  @HttpCode(HttpStatus.CREATED)
  async createRemove(
    @Body() dto: CreateRemoveMembershipRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createRemoveRequest(dto, actor) };
  }

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor) };
  }

  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getById(id, actor) };
  }
}
