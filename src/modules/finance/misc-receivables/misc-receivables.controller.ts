import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { MiscReceivablesService } from './misc-receivables.service';

@Controller('finance/misc-receivables')
export class MiscReceivablesController {
  constructor(private readonly receivablesService: MiscReceivablesService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN')
  async list(@Query() query: { status?: string; sourceModule?: string; page?: string; limit?: string }) {
    return this.receivablesService.list({
      status: query.status,
      sourceModule: query.sourceModule,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN')
  async get(@Param('id') id: string) {
    return { data: await this.receivablesService.get(id) };
  }

  @Post(':id/collect-payment')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE')
  async collectPayment(
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.receivablesService.collectPayment(id, dto, actor.personId) };
  }
}
