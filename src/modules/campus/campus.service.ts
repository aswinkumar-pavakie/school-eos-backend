import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HouseRepository } from '../academic/repositories/house.repository';
import { CreateCopyCenterOrderDto } from './dto/create-copy-center-order.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFoodOrderDto } from './dto/create-food-order.dto';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { CreateStationeryOrderDto } from './dto/create-stationery-order.dto';
import { CampusRequestRepository } from './repositories/campus-request.repository';

@Injectable()
export class CampusService {
  constructor(
    private readonly repo: CampusRequestRepository,
    private readonly houseRepo: HouseRepository,
    private readonly auditService: AuditService,
  ) {}

  async listHouses() {
    return this.houseRepo.findMany();
  }

  async createFoodOrder(personId: string, dto: CreateFoodOrderDto) {
    const row = await this.repo.createFoodOrder({ requestedBy: personId, ...dto });
    await this.auditService.record({
      actorPersonId: personId,
      action: 'CAMPUS_FOOD_ORDER_CREATED',
      objectType: 'campus_food_order',
      objectId: row.id,
      outcome: 'SUCCESS',
      afterData: row,
    });
    return row;
  }

  listFoodOrders(personId: string) {
    return this.repo.listFoodOrders(personId);
  }

  async createMedicalAppointment(personId: string, dto: CreateMedicalAppointmentDto) {
    const row = await this.repo.createMedicalAppointment({ requestedBy: personId, ...dto });
    await this.auditService.record({
      actorPersonId: personId,
      action: 'CAMPUS_MEDICAL_APPOINTMENT_CREATED',
      objectType: 'campus_medical_appointment',
      objectId: row.id,
      outcome: 'SUCCESS',
      afterData: row,
    });
    return row;
  }

  listMedicalAppointments(personId: string) {
    return this.repo.listMedicalAppointments(personId);
  }

  async createCopyCenterOrder(personId: string, dto: CreateCopyCenterOrderDto) {
    const row = await this.repo.createCopyCenterOrder({ requestedBy: personId, ...dto });
    await this.auditService.record({
      actorPersonId: personId,
      action: 'CAMPUS_COPY_CENTER_ORDER_CREATED',
      objectType: 'campus_copy_center_order',
      objectId: row.id,
      outcome: 'SUCCESS',
      afterData: row,
    });
    return row;
  }

  listCopyCenterOrders(personId: string) {
    return this.repo.listCopyCenterOrders(personId);
  }

  async createStationeryOrder(personId: string, dto: CreateStationeryOrderDto) {
    const row = await this.repo.createStationeryOrder({ requestedBy: personId, ...dto });
    await this.auditService.record({
      actorPersonId: personId,
      action: 'CAMPUS_STATIONERY_ORDER_CREATED',
      objectType: 'campus_stationery_order',
      objectId: row.id,
      outcome: 'SUCCESS',
      afterData: row,
    });
    return row;
  }

  listStationeryOrders(personId: string) {
    return this.repo.listStationeryOrders(personId);
  }

  async createFeedback(personId: string, dto: CreateFeedbackDto) {
    const row = await this.repo.createFeedback({ submittedBy: personId, ...dto });
    await this.auditService.record({
      actorPersonId: personId,
      action: 'CAMPUS_FEEDBACK_CREATED',
      objectType: 'campus_feedback',
      objectId: row.id,
      outcome: 'SUCCESS',
      afterData: row,
    });
    return row;
  }

  listFeedback(personId: string) {
    return this.repo.listFeedback(personId);
  }
}
