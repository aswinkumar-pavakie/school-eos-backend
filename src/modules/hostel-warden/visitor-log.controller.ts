import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateHostelVisitorDto } from './dto/create-hostel-visitor.dto';
import { VisitorQueryDto } from './dto/visitor-query.dto';
import { VisitorLogService } from './visitor-log.service';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/visitors')
export class VisitorLogController {
  constructor(private readonly service: VisitorLogService) {}

  @Get()
  async list(
    @Query() query: VisitorQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.list(actor.personId, query.status === 'open'),
    };
  }

  // School-wide, not warden-scoped -- backs the Principal/Vice Principal web console's real
  // Hostel "gate log" oversight (design-reframe addition). Registered before
  // the :id route below so "oversight" is never swallowed as a path param.
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  @Get('oversight')
  async listSchoolWide(@Query() query: VisitorQueryDto) {
    return { data: await this.service.listSchoolWide(query.status === 'open') };
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
  async recordEntry(
    @Body() dto: CreateHostelVisitorDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.recordEntry(dto, actor.personId) };
  }

  @Post(':id/exit')
  @HttpCode(HttpStatus.OK)
  async recordExit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.recordExit(id, actor.personId) };
  }
}
