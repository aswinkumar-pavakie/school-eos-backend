import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.query.dto';
import { PaymentsService } from './payments.service';

@Controller('finance/payments')
@Roles('FINANCE', 'ADMIN')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  async list(@Query() query: ListPaymentsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePaymentDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.create(dto, actor);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Get(':id/allocations')
  async listAllocations(@Param('id') id: string) {
    const receipts = await this.service.listReceipts(id);
    return { data: { receipts } };
  }

  @Post(':id/allocations')
  @HttpCode(HttpStatus.OK)
  async allocate(@Param('id') id: string, @Body() dto: AllocatePaymentDto) {
    const data = await this.service.allocate(id, dto.allocations);
    return { data };
  }

  @Get(':id/receipt')
  async getReceipt(@Param('id') id: string) {
    const data = await this.service.listReceipts(id);
    return { data };
  }

  @Post(':id/receipt')
  @HttpCode(HttpStatus.OK)
  async generateReceipt(@Param('id') id: string) {
    const data = await this.service.generateReceipts(id);
    return { data };
  }

  @Post(':id/clear-dd')
  @HttpCode(HttpStatus.OK)
  async clearDD(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.markDDCleared(id, actor);
    return { data };
  }

  @Get(':id/refunds')
  async listRefunds(@Param('id') id: string) {
    const data = await this.service.listRefundsForPayment(id);
    return { data };
  }

  @Post(':id/refunds')
  @HttpCode(HttpStatus.CREATED)
  async createRefund(
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.createRefund(id, dto, actor);
    return { data };
  }
}
