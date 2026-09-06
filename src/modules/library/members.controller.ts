import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateMemberDto } from './dto/create-member.dto';
import { EligibleMemberQueryDto, MemberQueryDto } from './dto/member-query.dto';
import { SuspendMemberDto } from './dto/suspend-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

@Controller('library/members')
@Roles('LIBRARY', 'ADMIN')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  async list(@Query() query: MemberQueryDto) {
    return this.membersService.list(query);
  }

  // Must stay registered before ':id' -- otherwise these would be swallowed
  // by the :id param route.
  @Get('eligible')
  @Roles('LIBRARY')
  async eligible(@Query() query: EligibleMemberQueryDto) {
    return { data: await this.membersService.eligible(query.search) };
  }

  @Get('grades-lookup')
  async gradesLookup() {
    return { data: await this.membersService.listGrades() };
  }

  @Get('sections-lookup')
  async sectionsLookup(@Query('gradeId') gradeId?: string) {
    return { data: await this.membersService.listSections(gradeId) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.membersService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async create(@Body() dto: CreateMemberDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.membersService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('LIBRARY')
  async update(@Param('id') id: string, @Body() dto: UpdateMemberDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.membersService.update(id, dto, actor.personId) };
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async suspend(@Param('id') id: string, @Body() dto: SuspendMemberDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.membersService.suspend(id, dto, actor.personId) };
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async reactivate(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.membersService.reactivate(id, actor.personId) };
  }
}
