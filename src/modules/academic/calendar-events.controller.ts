import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CalendarEventsService } from './calendar-events.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';

// IMPORTANT: this controller and modules/calendar/calendar-events.controller.ts
// both register GET/POST/PATCH/DELETE 'calendar-events' -- a pre-existing
// duplicate registration (AcademicModule is imported before CalendarModule in
// app.module.ts, so THIS one wins the route; the other one's own broadened
// PRINCIPAL/VICE_PRINCIPAL/MEDIA_ROOM access was silently never actually
// reachable -- confirmed live via a real MEDIA_ROOM account getting a 403
// from this exact route despite that other file's own @Roles looking
// correct. Not resolving that duplication here (out of this phase's scope)
// -- instead, method-level overrides added to the GET/POST methods that
// need them, mirroring exams.controller.ts's own precedent, so Principal's
// already-documented oversight need, Vice Principal's Phase 3 dashboard, and
// Media Room's own real Academic Calendar screen (read + create its own
// events, always scope_type SCHOOL -- no per-department scope exists) all
// actually work. PATCH/DELETE remain untouched, still ADMIN-only via the
// class default.
@Roles('ADMIN')
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly calendarEventsService: CalendarEventsService) {}

  @Get()
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'MEDIA_ROOM')
  async list(@Query() query: CalendarEventQueryDto) {
    return { data: await this.calendarEventsService.list(query) };
  }

  @Get(':id')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'MEDIA_ROOM')
  async get(@Param('id') id: string) {
    return { data: await this.calendarEventsService.get(id) };
  }

  @Post()
  @Roles('ADMIN', 'MEDIA_ROOM')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.calendarEventsService.create(dto, actor.personId),
    };
  }

  // Media Room may create its own real school-wide events (see the POST
  // override above) but must only ever edit/delete the ones it actually
  // created -- never Admin's or another department's. Admin keeps full
  // access to every event, same as before this override was added.
  private async assertCanModify(id: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.roles.includes('ADMIN')) return;
    const event = await this.calendarEventsService.get(id);
    if (event.createdBy !== actor.personId) {
      throw new ForbiddenException('You can only edit or delete calendar events you created.');
    }
  }

  @Patch(':id')
  @Roles('ADMIN', 'MEDIA_ROOM')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.assertCanModify(id, actor);
    return {
      data: await this.calendarEventsService.update(id, dto, actor.personId),
    };
  }

  @Delete(':id')
  @Roles('ADMIN', 'MEDIA_ROOM')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.assertCanModify(id, actor);
    await this.calendarEventsService.delete(id, actor.personId);
    return { data: { deleted: true } };
  }
}
