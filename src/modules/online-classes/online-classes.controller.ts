// POST /online-classes, GET /online-classes, GET /online-classes/:id,
// PATCH /online-classes/:id/reschedule, PATCH /online-classes/:id/cancel,
// PATCH /online-classes/:id/start, PATCH /online-classes/:id/complete,
// PATCH /online-classes/:id/recording — all Faculty-only (unchanged by parent access
// below), all scoped to the caller's own online classes (see OnlineClassesService for
// the ownership/authorization rules). start/complete take no body: the backend
// performs the SCHEDULED->LIVE->COMPLETED transition itself, a client can never supply
// an arbitrary status value.
//
// GET /online-classes and GET /online-classes/:id additionally accept PARENT. Express/
// Nest routing can't register two handlers for the same method+path, so both roles are
// handled by the SAME method, branching on actor.roles — the FACULTY branch calls the
// exact same OnlineClassesService.list/detail as before (byte-for-byte unchanged
// behavior), the PARENT branch calls the separate ParentOnlineClassesService. Every
// write endpoint below stays @Roles('FACULTY') only — a PARENT-only actor is rejected
// by RolesGuard before reaching the handler.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ONLINE_CLASS_ERRORS } from '../../common/errors/error-codes';
import { AddRecordingDto } from './dto/add-recording.dto';
import { CancelOnlineClassDto } from './dto/cancel-online-class.dto';
import { ListOnlineClassesDto } from './dto/list-online-classes.dto';
import { RescheduleOnlineClassDto } from './dto/reschedule-online-class.dto';
import { ScheduleOnlineClassDto } from './dto/schedule-online-class.dto';
import { OnlineClassesService } from './online-classes.service';
import { ParentOnlineClassesService } from './parent-online-classes.service';

@Controller('online-classes')
export class OnlineClassesController {
  constructor(
    private readonly onlineClassesService: OnlineClassesService,
    private readonly parentOnlineClassesService: ParentOnlineClassesService,
  ) {}

  @Roles('FACULTY')
  @Post()
  @HttpCode(HttpStatus.OK)
  async schedule(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: ScheduleOnlineClassDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        ONLINE_CLASS_ERRORS.IDEMPOTENCY_KEY_REQUIRED,
      );
    }
    const result = await this.onlineClassesService.schedule(
      actor,
      dto,
      idempotencyKey,
    );
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT')
  @Get()
  async list(
    @CurrentActor() actor: AuthenticatedUser,
    @Query() query: ListOnlineClassesDto,
  ) {
    // A user holding both roles (unusual, but not impossible in this role model) keeps
    // getting exactly the existing Faculty behavior — this branch order never changes
    // what a Faculty caller sees.
    if (actor.roles.includes('FACULTY')) {
      const result = await this.onlineClassesService.list(actor, query.view);
      return { data: result };
    }
    const result = await this.parentOnlineClassesService.list(
      actor,
      query.view,
    );
    return { data: result };
  }

  // Declared before ':id' below — Nest matches routes in declaration order, and this
  // literal path would otherwise be swallowed by the ':id' param route.
  @Roles('FACULTY')
  @Get('my-subject-offerings')
  async myTeachingOfferings(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.onlineClassesService.myTeachingOfferings(actor);
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT')
  @Get(':id')
  async detail(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    if (actor.roles.includes('FACULTY')) {
      const result = await this.onlineClassesService.detail(actor, id);
      return { data: result };
    }
    const result = await this.parentOnlineClassesService.detail(actor, id);
    return { data: result };
  }

  // PARENT-only — Faculty already gets meetingUrl via their own detail() above and has
  // no use for this endpoint's narrow {meetingUrl, status} shape or its join-specific
  // state rules (SCHEDULED/LIVE only). Pure read: no Google call, no write to
  // online_class, delegates entirely to ParentOnlineClassesService.join, which itself
  // delegates authorization entirely to the existing, unmodified detail() lookup.
  @Roles('PARENT')
  @Get(':id/join')
  async join(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.parentOnlineClassesService.join(actor, id);
    return { data: result };
  }

  @Roles('FACULTY')
  @Patch(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RescheduleOnlineClassDto,
  ) {
    const result = await this.onlineClassesService.reschedule(actor, id, dto);
    return { data: result };
  }

  @Roles('FACULTY')
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOnlineClassDto,
  ) {
    const result = await this.onlineClassesService.cancel(actor, id, dto);
    return { data: result };
  }

  @Roles('FACULTY')
  @Patch(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.onlineClassesService.startClass(actor, id);
    return { data: result };
  }

  @Roles('FACULTY')
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.onlineClassesService.completeClass(actor, id);
    return { data: result };
  }

  @Roles('FACULTY')
  @Patch(':id/recording')
  @HttpCode(HttpStatus.OK)
  async addRecording(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddRecordingDto,
  ) {
    const result = await this.onlineClassesService.addRecording(actor, id, dto);
    return { data: result };
  }
}
