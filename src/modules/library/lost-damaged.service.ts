import { Injectable, NotFoundException } from '@nestjs/common';
import { LostDamagedQueryDto } from './dto/lost-damaged-query.dto';
import { LibraryLostDamagedReportRepository } from './repositories/library-lost-damaged-report.repository';

// Read-only -- the actual write happens as a side effect of BookCopiesService's
// markLost/markDamaged and CirculationService's own markLost (see those files),
// never a second create endpoint here. This keeps one authoritative place a
// copy's status actually changes, with this module only reporting on it.
@Injectable()
export class LostDamagedService {
  constructor(private readonly reportRepo: LibraryLostDamagedReportRepository) {}

  async list(query: LostDamagedQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.reportRepo.findMany({
      type: query.type,
      status: query.status,
      search: query.search,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const report = await this.reportRepo.findById(id);
    if (!report) throw new NotFoundException('Lost/damaged report not found');
    return report;
  }
}
