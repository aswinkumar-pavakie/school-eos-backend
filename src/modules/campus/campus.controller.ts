import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CampusService } from './campus.service';
import { CreateCopyCenterOrderDto } from './dto/create-copy-center-order.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFoodOrderDto } from './dto/create-food-order.dto';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { CreateStationeryOrderDto } from './dto/create-stationery-order.dto';

// Faculty's own Campus tiles. Every request here is scoped to "my own
// requests" (requested_by = actor.personId) -- there's no cross-person read
// anywhere in this controller, so CLASS_ADVISOR is included alongside
// FACULTY with no extra scoping work needed (same reasoning as every other
// "my own X" endpoint in this codebase).
@Roles('FACULTY', 'CLASS_ADVISOR')
@Controller('campus')
export class CampusController {
  constructor(private readonly service: CampusService) {}

  @Get('houses')
  async listHouses() {
    return { data: await this.service.listHouses() };
  }

  @Get('food-orders')
  async listFoodOrders(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listFoodOrders(actor.personId) };
  }

  @Post('food-orders')
  @HttpCode(HttpStatus.CREATED)
  async createFoodOrder(@Body() dto: CreateFoodOrderDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createFoodOrder(actor.personId, dto) };
  }

  @Get('medical-appointments')
  async listMedicalAppointments(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMedicalAppointments(actor.personId) };
  }

  @Post('medical-appointments')
  @HttpCode(HttpStatus.CREATED)
  async createMedicalAppointment(@Body() dto: CreateMedicalAppointmentDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createMedicalAppointment(actor.personId, dto) };
  }

  @Get('copy-center-orders')
  async listCopyCenterOrders(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listCopyCenterOrders(actor.personId) };
  }

  @Post('copy-center-orders')
  @HttpCode(HttpStatus.CREATED)
  async createCopyCenterOrder(@Body() dto: CreateCopyCenterOrderDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createCopyCenterOrder(actor.personId, dto) };
  }

  @Get('stationery-orders')
  async listStationeryOrders(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listStationeryOrders(actor.personId) };
  }

  @Post('stationery-orders')
  @HttpCode(HttpStatus.CREATED)
  async createStationeryOrder(@Body() dto: CreateStationeryOrderDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createStationeryOrder(actor.personId, dto) };
  }

  @Get('feedback')
  async listFeedback(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listFeedback(actor.personId) };
  }

  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  async createFeedback(@Body() dto: CreateFeedbackDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createFeedback(actor.personId, dto) };
  }
}
