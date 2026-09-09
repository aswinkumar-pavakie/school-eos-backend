import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateRazorpayOrderDto } from './dto/create-razorpay-order.dto';
import { FeeTermQueryDto } from './dto/fee-term-query.dto';
import { ParentFeesService } from './parent-fees.service';

@Controller('parent')
@Roles('PARENT')
export class ParentFeesController {
  constructor(private readonly service: ParentFeesService) {}

  @Get('children')
  async listChildren(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listChildren(actor) };
  }

  @Get('students/:studentId/fee-terms')
  async listTerms(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return { data: await this.service.listTerms(actor, studentId) };
  }

  @Get('students/:studentId/fees')
  async getFeeSummary(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: FeeTermQueryDto,
  ) {
    return {
      data: await this.service.getFeeSummary(
        actor,
        studentId,
        query.academicYearId,
        query.instalmentNo,
      ),
    };
  }

  @Post('students/:studentId/fees/razorpay-order')
  async createRazorpayOrder(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: CreateRazorpayOrderDto,
  ) {
    return {
      data: await this.service.createRazorpayOrder(actor, studentId, dto),
    };
  }

  @Get('students/:studentId/payments')
  async listPayments(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return { data: await this.service.listPayments(actor, studentId) };
  }

  @Get('receipts/:receiptId')
  async getReceipt(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
  ) {
    return { data: await this.service.getReceipt(actor, receiptId) };
  }
}
