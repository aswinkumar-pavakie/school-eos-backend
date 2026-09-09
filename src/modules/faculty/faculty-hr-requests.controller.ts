import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateStaffHrRequestDto } from './dto/create-staff-hr-request.dto';
import { FacultyHrRequestsService } from './faculty-hr-requests.service';

@Roles('FACULTY')
@Controller('faculty/hr-requests')
export class FacultyHrRequestsController {
  constructor(private readonly service: FacultyHrRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.get(actor.personId, id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStaffHrRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, dto) };
  }
}
