import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateResultEntryDto } from './dto/create-result-entry.dto';
import { UpdateResultEntryDto } from './dto/update-result-entry.dto';
import { ResultEntryStatus, RESULT_ENTRY_STATUSES } from './repositories/sports-result-entry.repository';
import { SportsResultEntriesService } from './sports-result-entries.service';

// One real table/service backs both the design's "Entry results" screen
// (this same list, unfiltered, with create) and its "Result verification"
// screen (the mobile/website client just requests ?status=PENDING and calls
// PATCH with status=VERIFIED/REJECTED) -- see the repository's own comment
// for why these were built as one state machine rather than two tables.
@Roles('SPORTS_ADMIN')
@Controller('sports/result-entries')
export class SportsResultEntriesController {
  constructor(private readonly service: SportsResultEntriesService) {}

  @Get()
  async list(@Query('status') status?: string) {
    const validStatus = status && (RESULT_ENTRY_STATUSES as readonly string[]).includes(status) ? (status as ResultEntryStatus) : undefined;
    return { data: await this.service.list(validStatus) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateResultEntryDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResultEntryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(actor, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.delete(actor, id);
    return { data: { deleted: true } };
  }
}
