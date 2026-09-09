import { Injectable, NotFoundException } from '@nestjs/common';
import { TripsQueryDto } from './dto/trips-query.dto';
import { TripsRepository } from './repositories/trips.repository';

@Injectable()
export class TripsService {
  constructor(private readonly tripsRepo: TripsRepository) {}

  async list(query: TripsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const { rows, total } = await this.tripsRepo.findMany({
      date: query.date,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      vehicleId: query.vehicleId,
      routeId: query.routeId,
      driverId: query.driverId,
      state: query.state,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const trip = await this.tripsRepo.findById(id);
    if (!trip) throw new NotFoundException('Trip not found.');

    const [attendance, timeline] = await Promise.all([
      this.tripsRepo.findAttendanceCounts(id),
      this.tripsRepo.findBoardingTimeline(id),
    ]);

    return { trip, attendance, timeline };
  }
}
