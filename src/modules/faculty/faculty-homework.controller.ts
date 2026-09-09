import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { FacultyHomeworkService } from './faculty-homework.service';

@Roles('FACULTY')
@Controller('faculty/homework')
export class FacultyHomeworkController {
  constructor(private readonly service: FacultyHomeworkService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateHomeworkDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, dto) };
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHomeworkDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.update(actor.personId, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.remove(actor.personId, id);
  }

  @Get(':id/roster')
  async roster(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tab') tab: 'DONE' | 'NOT_DONE' | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getRoster(actor.personId, id, tab) };
  }

  @Get(':id/roster/:studentId/file-url')
  async getSubmissionFileUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('key') key: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: { url: await this.service.getSubmissionFileUrl(actor.personId, id, studentId, key) } };
  }
}
