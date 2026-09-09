import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { SectionQueryDto } from './dto/section-query.dto';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's Students module needs section names for enrolment display) --
// write methods below have their own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  async list(@Query() query: SectionQueryDto) {
    return { data: await this.sectionsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.sectionsService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateSectionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sectionsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.sectionsService.update(id, dto, actor.personId) };
  }
}
