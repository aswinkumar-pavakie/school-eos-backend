import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { PaymentsService } from './payments.service';

@Controller('finance/refunds')
export class RefundsController {
  constructor(private readonly service: PaymentsService) {}

  @Get(':id')
  @Roles('FINANCE', 'ADMIN', 'PRINCIPAL')
  async getById(@Param('id') id: string) {
    const data = await this.service.getRefundById(id);
    return { data };
  }

  @Post(':id/process')
  @Roles('FINANCE')
  @HttpCode(HttpStatus.OK)
  async process(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.processRefundPayout(id, actor);
    return { data };
  }
}
