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
import { CommunityProposalsService } from './community-proposals.service';
import { CreateCommunityProposalDto } from './dto/create-community-proposal.dto';
import { ResubmitCommunityProposalDto } from './dto/resubmit-community-proposal.dto';

// Community-only, end to end. Principal reviews via the existing generic
// /approvals/:id/approve|reject|send-back endpoints -- no duplicate decision
// endpoint here, per the approved Phase 5 scope. Admin/other roles get no new
// access to this controller at all (not part of the approved scope).
@Roles('COMMUNITY')
@Controller('community-proposals')
export class CommunityProposalsController {
  constructor(private readonly service: CommunityProposalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCommunityProposalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor) };
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

  @Post(':id/resubmit')
  @HttpCode(HttpStatus.OK)
  async resubmit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResubmitCommunityProposalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.resubmit(id, dto, actor) };
  }
}
