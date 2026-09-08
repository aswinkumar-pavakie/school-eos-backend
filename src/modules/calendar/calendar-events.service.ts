import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CalendarEventRepository } from './repositories/calendar-event.repository';

@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly calendarEventRepo: CalendarEventRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: CalendarEventQueryDto) {
    return this.calendarEventRepo.findMany(query);
  }

  /** Mirrors the real calendar_event_scope CHECK constraint: SCHOOL/STAGE never
   * take a scopeId, CAMPUS/GRADE/SECTION always need one; STAGE always needs a
   * scopeStage, everything else must leave it null. Checked here so a mismatch is
   * a clean 400 with a useful message, not a raw constraint-violation 500. */
  private assertValidScope(dto: CreateCalendarEventDto): void {
    if (dto.scopeType === 'SCHOOL') {
      if (dto.scopeId || dto.scopeStage) {
        throw new BadRequestException(
          'scopeType SCHOOL must not have a scopeId or scopeStage.',
        );
      }
    } else if (dto.scopeType === 'STAGE') {
      if (dto.scopeId || !dto.scopeStage) {
        throw new BadRequestException(
          'scopeType STAGE needs a scopeStage and no scopeId.',
        );
      }
    } else {
      if (!dto.scopeId || dto.scopeStage) {
        throw new BadRequestException(
          `scopeType ${dto.scopeType} needs a scopeId and no scopeStage.`,
        );
      }
    }
  }

  async create(dto: CreateCalendarEventDto, actorPersonId: string) {
    this.assertValidScope(dto);
    const created = await this.calendarEventRepo.create({
      academicYearId: dto.academicYearId,
      title: dto.title,
      description: dto.description ?? null,
      eventType: dto.eventType,
      isHoliday: dto.isHoliday,
      startDate: dto.startDate,
      endDate: dto.endDate,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId ?? null,
      scopeStage: dto.scopeStage ?? null,
      createdBy: actorPersonId,
    });
    await this.auditService.record({
      actorPersonId,
      action: 'CALENDAR_EVENT_CREATED',
      objectType: 'calendar_event',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async remove(id: string, actorPersonId: string): Promise<void> {
    const existing = await this.calendarEventRepo.findById(id);
    if (!existing) throw new NotFoundException('Calendar event not found');
    await this.calendarEventRepo.delete(id);
    await this.auditService.record({
      actorPersonId,
      action: 'CALENDAR_EVENT_DELETED',
      objectType: 'calendar_event',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }
}
