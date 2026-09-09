import {
  Body,
  Controller,
  Delete,
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
// PRINCIPAL/VICE_PRINCIPAL read access was silently never actually reachable).
// Not resolving that duplication here (out of this phase's scope) -- instead,
// method-level overrides added to the two GET methods only, mirroring
// exams.controller.ts's own precedent, so Principal's already-documented
// oversight need and Vice Principal's Phase 3 dashboard both actually work.
// Every write method below is untouched, still ADMIN-only via the class default.
@Roles('ADMIN')
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly calendarEventsService: CalendarEventsService) {}

  @Get()
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async list(@Query() query: CalendarEventQueryDto) {
    return { data: await this.calendarEventsService.list(query) };
  }

  @Get(':id')
  @Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
  async get(@Param('id') id: string) {
    return { data: await this.calendarEventsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.calendarEventsService.create(dto, actor.personId),
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.calendarEventsService.update(id, dto, actor.personId),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.calendarEventsService.delete(id, actor.personId);
    return { data: { deleted: true } };
  }
}
