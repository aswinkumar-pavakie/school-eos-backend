import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CalendarEventsService } from './calendar-events.service';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';

// Read/write over the real, already-populated calendar_event table -- see
// query.md for how this was found (same story as Timetable: schema and data
// existed, just no API).
// Class-level role covers the read-only list endpoint for Principal's (and,
// as of Vice Principal Phase 3's dashboard, Vice Principal's) own oversight
// view; create/remove are explicitly re-narrowed to ADMIN below -- neither
// Principal nor Vice Principal has create/edit/delete authority here (no
// PATCH endpoint even exists for Admin, and no approval workflow gates
// calendar events).
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly calendarEventsService: CalendarEventsService) {}

  @Get()
  async list(@Query() query: CalendarEventQueryDto) {
    return { data: await this.calendarEventsService.list(query) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCalendarEventDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.calendarEventsService.create(dto, actor.personId) };
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.calendarEventsService.remove(id, actor.personId);
    return { data: { removed: true } };
  }
}
