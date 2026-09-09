import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CirculationService } from './circulation.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssueQueryDto } from './dto/issue-query.dto';
import { MarkLostDto } from './dto/mark-lost.dto';

@Controller('library/issues')
@Roles('LIBRARY', 'ADMIN')
export class CirculationController {
  constructor(private readonly circulationService: CirculationService) {}

  @Get()
  async list(@Query() query: IssueQueryDto) {
    return this.circulationService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.circulationService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async issue(@Body() dto: CreateIssueDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.circulationService.issue(dto, actor.personId) };
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async returnBook(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.circulationService.returnBook(id, actor.personId) };
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async renew(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.circulationService.renew(id, actor.personId) };
  }

  @Post(':id/mark-lost')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async markLost(@Param('id') id: string, @Body() dto: MarkLostDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.circulationService.markLost(id, actor.personId, dto.reason, dto.notes) };
  }
}
