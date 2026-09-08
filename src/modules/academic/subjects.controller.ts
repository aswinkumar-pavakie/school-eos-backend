import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's Academics module) -- write methods below have their own
// narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
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
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSubjectDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.subjectsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.subjectsService.update(id, dto, actor.personId) };
  }
}
