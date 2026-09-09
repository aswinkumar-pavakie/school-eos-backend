import { Injectable } from '@nestjs/common';
import { BoardingEventsQueryDto } from './dto/boarding-events-query.dto';
import { BoardingEventsRepository } from './repositories/boarding-events.repository';

@Injectable()
export class BoardingEventsService {
  constructor(private readonly boardingEventsRepo: BoardingEventsRepository) {}

  async list(query: BoardingEventsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.boardingEventsRepo.findMany({
      date: query.date,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      vehicleId: query.vehicleId,
      routeId: query.routeId,
      tripId: query.tripId,
      gradeId: query.gradeId,
      source: query.source,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }
}
