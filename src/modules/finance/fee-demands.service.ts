import { Injectable } from '@nestjs/common';
import { FeeDemandQueryDto } from './dto/fee-demand-query.dto';
import { FeeDemandRepository } from './repositories/fee-demand.repository';

@Injectable()
export class FeeDemandsService {
  constructor(private readonly feeDemandRepo: FeeDemandRepository) {}

  async list(query: FeeDemandQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.feeDemandRepo.findMany({
      academicYearId: query.academicYearId,
      gradeId: query.gradeId,
      sectionId: query.sectionId,
      state: query.state,
      search: query.search,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }
}
