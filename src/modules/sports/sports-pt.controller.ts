// Sports Admin "PT / sports periods" -- no new schema at all: Physical
// Training is a real subject in the academic catalog, so its periods are
// already real timetable_slot rows (confirmed live: 272 real rows exist).
// This just filters the existing, real timetable by that one subject and
// groups it by class for the design's own CLASS x MON-SAT grid.

import { Controller, Get, NotFoundException } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { TimetableService } from '../timetable/timetable.service';

@Roles('SPORTS_ADMIN')
@Controller('sports/pt-periods')
export class SportsPtController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly postgres: PostgresService,
  ) {}

  @Get()
  async list() {
    const { rows } = await this.postgres.query<{ id: string }>(
      `SELECT id FROM subject WHERE name = 'Physical Training' LIMIT 1`,
    );
    const subjectId = rows[0]?.id;
    if (!subjectId) throw new NotFoundException('Physical Training subject not found in the catalog');
    return { data: await this.timetableService.getForSubject(subjectId) };
  }
}
