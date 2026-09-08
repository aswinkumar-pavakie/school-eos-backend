import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateStaffLeaveDto } from './dto/create-staff-leave.dto';
import { FacultyStaffLeaveService } from './faculty-staff-leave.service';

@Roles('FACULTY')
@Controller('faculty/staff-leave')
export class FacultyStaffLeaveController {
  constructor(private readonly service: FacultyStaffLeaveService) {}

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
  async create(@Body() dto: CreateStaffLeaveDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, dto) };
  }
}
