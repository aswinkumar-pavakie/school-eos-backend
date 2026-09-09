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
import { AttendantsService } from './attendants.service';
import { CreateAttendantDto } from './dto/create-attendant.dto';
import { UpdateAttendantDto } from './dto/update-attendant.dto';

@Roles('ADMIN')
@Controller('attendants')
export class AttendantsController {
  constructor(private readonly attendantsService: AttendantsService) {}

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- these reads are reachable by
  // TRANSPORT_MANAGER too; create/update stay ADMIN-only exactly as before.
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get()
  async list() {
    return { data: await this.attendantsService.list() };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.attendantsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAttendantDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.attendantsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendantDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.attendantsService.update(id, dto, actor.personId),
    };
  }
}
