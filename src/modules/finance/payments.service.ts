import { Injectable } from '@nestjs/common';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentRepository } from './repositories/payment.repository';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentRepo: PaymentRepository) {}

  async list(query: PaymentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.paymentRepo.findMany({
      search: query.search,
      state: query.state,
      mode: query.mode,
      academicYearId: query.academicYearId,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }
}
