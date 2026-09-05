import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Roles('ADMIN')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  async list() {
    return { data: await this.subjectsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.subjectsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSubjectDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.subjectsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.subjectsService.update(id, dto, actor.personId) };
  }
}
