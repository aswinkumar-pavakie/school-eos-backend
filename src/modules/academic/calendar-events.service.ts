import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CalendarEventRepository } from './repositories/calendar-event.repository';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { assertValidCalendarEventScope } from './calendar-event-scope.util';
import { isForeignKeyViolation } from './pg-error.util';

@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly calendarEventRepo: CalendarEventRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: CalendarEventQueryDto) {
    return this.calendarEventRepo.findMany(query);
  }

  async get(id: string) {
    const event = await this.calendarEventRepo.findById(id);
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async create(dto: CreateCalendarEventDto, createdBy: string) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }
    assertValidCalendarEventScope(dto);

    try {
      const created = await this.calendarEventRepo.create({ ...dto, createdBy });
      await this.auditService.record({
        actorPersonId: createdBy,
        action: 'CALENDAR_EVENT_CREATED',
        objectType: 'calendar_event',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException('academicYearId or scopeId does not exist.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCalendarEventDto, actorPersonId: string) {
    const existing = await this.get(id);

    const nextStart = dto.startDate ?? existing.startDate;
    const nextEnd = dto.endDate ?? existing.endDate;
    if (nextEnd < nextStart) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }

    assertValidCalendarEventScope({
      scopeType: dto.scopeType ?? existing.scopeType,
      scopeId: dto.scopeId ?? existing.scopeId,
      scopeStage: dto.scopeStage ?? existing.scopeStage,
    });

    try {
      const updated = await this.calendarEventRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Calendar event not found');
      await this.auditService.record({
        actorPersonId,
        action: 'CALENDAR_EVENT_UPDATED',
        objectType: 'calendar_event',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException('scopeId does not exist.');
      }
      throw err;
    }
  }

  async delete(id: string, actorPersonId: string) {
    const deleted = await this.calendarEventRepo.delete(id);
    if (!deleted) throw new NotFoundException('Calendar event not found');
    await this.auditService.record({
      actorPersonId,
      action: 'CALENDAR_EVENT_DELETED',
      objectType: 'calendar_event',
      objectId: id,
      outcome: 'SUCCESS',
    });
  }
}
