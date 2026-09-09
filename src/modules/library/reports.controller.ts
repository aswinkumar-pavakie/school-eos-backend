import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { ReportsService } from './reports.service';

@Controller('library/reports')
@Roles('LIBRARY', 'ADMIN')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventory')
  async inventory() {
    return { data: await this.reportsService.inventory() };
  }

  @Get('transaction-history')
  async transactionHistory(@Query() query: TransactionHistoryQueryDto) {
    return this.reportsService.transactionHistory(query);
  }
}
