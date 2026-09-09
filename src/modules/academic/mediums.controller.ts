import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MediumsService } from './mediums.service';
import { CreateMediumDto } from './dto/create-medium.dto';
import { UpdateMediumDto } from './dto/update-medium.dto';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's Academics module), and to VICE_PRINCIPAL (Phase 8 mobile
// Academics module -- same read-only oversight need) -- write methods below
// have their own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('mediums')
export class MediumsController {
  constructor(private readonly mediumsService: MediumsService) {}

  @Get()
  async list() {
    return { data: await this.mediumsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.mediumsService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMediumDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.mediumsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediumDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.mediumsService.update(id, dto, actor.personId) };
  }
}
