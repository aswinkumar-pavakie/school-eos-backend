import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ComplaintsService } from './complaints.service';
import { CreateHostelComplaintDto } from './dto/create-hostel-complaint.dto';
import { UpdateHostelComplaintDto } from './dto/update-hostel-complaint.dto';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/complaints')
export class ComplaintsController {
  constructor(private readonly service: ComplaintsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  // School-wide, not warden-scoped -- backs the Principal/Vice Principal web console's real
  // Hostel "open complaints" oversight (design-reframe addition). Registered
  // before the :id route below so "oversight" is never swallowed as a path param.
  @Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL')
  @Get('oversight')
  async listSchoolWide() {
    return { data: await this.service.listSchoolWide() };
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.get(id, actor.personId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateHostelComplaintDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Patch(':id')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHostelComplaintDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateStatus(id, dto, actor.personId) };
  }
}
