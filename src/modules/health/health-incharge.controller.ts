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
  Put,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import {
  AlertListQueryDto,
  CreateEscalationDto,
  CreateInfirmaryVisitDto,
  StudentSearchQueryDto,
  UpdateInfirmaryVisitDto,
  UpsertHealthProfileDto,
  VisitListQueryDto,
} from './dto/health-incharge.dto';
import { HealthInchargeService } from './health-incharge.service';

// The Health In-charge console. Only this role: the Admin / Principal / Vice Principal
// oversight stays read-only on HealthController (GET /health/...).
@Roles('HEALTH_INCHARGE')
@Controller('health-incharge')
export class HealthInchargeController {
  constructor(private readonly service: HealthInchargeService) {}

  @Get('dashboard')
  async dashboard() {
    return { data: await this.service.dashboard() };
  }

  @Get('students')
  async students(@Query() query: StudentSearchQueryDto) {
    return { data: await this.service.searchStudents(query.search) };
  }

  @Get('students/:studentId')
  async student(@Param('studentId', new ParseUUIDPipe()) studentId: string) {
    return { data: await this.service.studentSummary(studentId) };
  }

  @Put('students/:studentId/profile')
  async saveProfile(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpsertHealthProfileDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.saveProfile(studentId, dto, actor.personId) };
  }

  @Get('visits')
  async visits(@Query() query: VisitListQueryDto) {
    return { data: await this.service.listVisits(query) };
  }

  @Post('visits')
  @HttpCode(HttpStatus.CREATED)
  async createVisit(@Body() dto: CreateInfirmaryVisitDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createVisit(dto, actor.personId) };
  }

  @Patch('visits/:id')
  async updateVisit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInfirmaryVisitDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateVisit(id, dto, actor.personId) };
  }

  @Post('visits/:id/notify-parent')
  @HttpCode(HttpStatus.OK)
  async notifyParent(@Param('id', new ParseUUIDPipe()) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.notifyParent(id, actor.personId) };
  }

  @Get('alerts')
  async alerts(@Query() query: AlertListQueryDto) {
    return { data: await this.service.listAlerts(query.status) };
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledge(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.acknowledgeAlert(id, actor.personId) };
  }

  @Get('escalations')
  async escalations(@Query('studentId') studentId?: string) {
    return { data: await this.service.listEscalations(studentId) };
  }

  @Post('escalations')
  @HttpCode(HttpStatus.CREATED)
  async createEscalation(@Body() dto: CreateEscalationDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createEscalation(dto, actor.personId) };
  }
}
