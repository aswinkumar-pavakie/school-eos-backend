import { Module } from '@nestjs/common';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsService } from './calendar-events.service';
import { CalendarEventRepository } from './repositories/calendar-event.repository';

@Module({
  controllers: [CalendarEventsController],
  providers: [CalendarEventsService, CalendarEventRepository],
})
export class CalendarModule {}
