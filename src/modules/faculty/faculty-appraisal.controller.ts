import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateStaffAppraisalDto } from './dto/create-staff-appraisal.dto';
import { FacultyAppraisalService } from './faculty-appraisal.service';

@Roles('FACULTY')
@Controller('faculty/appraisal')
export class FacultyAppraisalController {
  constructor(private readonly service: FacultyAppraisalService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.get(actor.personId, id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStaffAppraisalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(actor.personId, dto) };
  }
}
