// FACULTY: POST/GET /api/v1/permissions/activities, GET/PATCH .../:activityId,
// POST .../:activityId/cancel, GET .../:activityId/status -- create/manage the
// shared activity + its fanned-out per-student permission_request rows. All
// authorization/business logic lives in PermissionActivityService; this
// controller only wires HTTP shape.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreatePermissionActivityDto } from './dto/create-permission-activity.dto';
import { UpdatePermissionActivityDto } from './dto/update-permission-activity.dto';
import { PermissionActivityService } from './permission-activity.service';

@Controller('permissions/activities')
export class PermissionActivitiesController {
  constructor(private readonly activityService: PermissionActivityService) {}

  @Roles('FACULTY')
  @Post()
  async create(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: CreatePermissionActivityDto,
  ) {
    const result = await this.activityService.create(actor, dto);
    return { data: result };
  }

  @Roles('FACULTY')
  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.activityService.list(actor);
    return { data: result };
  }

  // Registered BEFORE ':activityId' -- a literal segment route must precede a
  // param route at the same depth, or Nest/Express would greedily match
  // "my-sections" as an :activityId value instead.
  @Roles('FACULTY')
  @Get('my-sections')
  async listMySections(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.activityService.listMySections(actor);
    return { data: result };
  }

  @Roles('FACULTY')
  @Get(':activityId')
  async detail(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
  ) {
    const result = await this.activityService.detail(actor, activityId);
    return { data: result };
  }

  @Roles('FACULTY')
  @Patch(':activityId')
  async update(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body() dto: UpdatePermissionActivityDto,
  ) {
    const result = await this.activityService.update(actor, activityId, dto);
    return { data: result };
  }

  @Roles('FACULTY')
  @Post(':activityId/cancel')
  async cancel(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
  ) {
    const result = await this.activityService.cancel(actor, activityId);
    return { data: result };
  }

  @Roles('FACULTY')
  @Get(':activityId/status')
  async status(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
  ) {
    const result = await this.activityService.status(actor, activityId);
    return { data: result };
  }

  // "History" detail: per-student breakdown, including which guardian responded.
  @Roles('FACULTY')
  @Get(':activityId/requests')
  async listStudentRequests(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
  ) {
    const result = await this.activityService.listStudentRequests(
      actor,
      activityId,
    );
    return { data: result };
  }
}
