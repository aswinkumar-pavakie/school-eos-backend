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
import { RequestPayslipAccessDto } from './dto/request-payslip-access.dto';
import { FacultyPayslipService } from './faculty-payslip.service';

@Roles('FACULTY')
@Controller('faculty/payslip')
export class FacultyPayslipController {
  constructor(private readonly service: FacultyPayslipService) {}

  // Registered before ':id' -- otherwise "request-status" would be swallowed
  // as the :id param below.
  @Get('request-status')
  async requestStatus(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getRequestStatus(actor.personId) };
  }

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async requestAccess(
    @Body() dto: RequestPayslipAccessDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.requestAccess(actor.personId, dto.note) };
  }

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
}
