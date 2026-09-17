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
import { CampusesService } from './campuses.service';
import { CreateCampusDto } from './dto/create-campus.dto';
import { UpdateCampusDto } from './dto/update-campus.dto';

// Class-level @Roles broadened to include PRINCIPAL and VICE_PRINCIPAL for
// read-only oversight (real, existing use: Principal's/VP's own Academic
// Calendar page already calls GET /campuses to scope events by campus, and
// was silently getting a 403 -- caught in a wiring audit) -- write methods
// below keep their own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL')
@Controller('campuses')
export class CampusesController {
  constructor(private readonly campusesService: CampusesService) {}

  @Get()
  async list() {
    return { data: await this.campusesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.campusesService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCampusDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.campusesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCampusDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.campusesService.update(id, dto, actor.personId) };
  }

  @Post(':id/set-primary')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async setPrimary(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.campusesService.setPrimary(id, actor.personId) };
  }
}
