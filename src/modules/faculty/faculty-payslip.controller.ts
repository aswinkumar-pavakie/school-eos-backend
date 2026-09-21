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

// Broadened to PRINCIPAL (2026-09) -- same generic staff self-service
// capability as faculty-hr-requests.controller.ts / faculty-appraisal.
// controller.ts (identical FacultyScopeRepository.getStaffId() lookup, not
// Faculty-specific).
@Roles('FACULTY', 'PRINCIPAL')
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
    return {
      data: await this.service.requestAccess(actor.personId, dto.note, actor.roles[0]),
    };
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
