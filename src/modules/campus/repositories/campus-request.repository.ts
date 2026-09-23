// Campus request queues (Food Court, Medical, Copy Center, Stationery
// Store) -- real, own tables (see database/migrations/0033_campus_features.sql),
// each a simple own-status fulfillment queue, not routed through the
// generic approval_request engine (these are "place an order" flows, not
// manager-approval ones -- see that migration's own header note).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FoodOrderRow {
  id: string;
  requestedBy: string;
  items: string;
  pickupTime: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
}

export interface MedicalAppointmentRow {
  id: string;
  requestedBy: string;
  preferredDate: string;
  preferredTime: string | null;
  reason: string;
  status: string;
  createdAt: Date;
}

export interface CopyCenterOrderRow {
  id: string;
  requestedBy: string;
  description: string;
  quantity: number | null;
  neededBy: string | null;
  status: string;
  createdAt: Date;
}

export interface StationeryOrderRow {
  id: string;
  requestedBy: string;
  items: string;
  notes: string | null;
  status: string;
  createdAt: Date;
}

export interface FeedbackRow {
  id: string;
  submittedBy: string;
  category: string;
  message: string;
  createdAt: Date;
}

@Injectable()
export class CampusRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async createFoodOrder(
    input: { requestedBy: string; items: string; pickupTime?: string | null; notes?: string | null },
    executor: Queryable = this.postgres,
  ): Promise<FoodOrderRow> {
    const { rows } = await executor.query(
      `INSERT INTO campus_food_order (requested_by, items, pickup_time, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, requested_by AS "requestedBy", items, pickup_time AS "pickupTime", notes, status, created_at AS "createdAt"`,
      [input.requestedBy, input.items, input.pickupTime ?? null, input.notes ?? null],
    );
    return rows[0];
  }

  async listFoodOrders(personId: string, executor: Queryable = this.postgres): Promise<FoodOrderRow[]> {
    const { rows } = await executor.query(
      `SELECT id, requested_by AS "requestedBy", items, pickup_time AS "pickupTime", notes, status, created_at AS "createdAt"
       FROM campus_food_order WHERE requested_by = $1 ORDER BY created_at DESC`,
      [personId],
    );
    return rows;
  }

  async createMedicalAppointment(
    input: { requestedBy: string; preferredDate: string; preferredTime?: string | null; reason: string },
    executor: Queryable = this.postgres,
  ): Promise<MedicalAppointmentRow> {
    const { rows } = await executor.query(
      `INSERT INTO campus_medical_appointment (requested_by, preferred_date, preferred_time, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, requested_by AS "requestedBy", preferred_date AS "preferredDate", preferred_time AS "preferredTime", reason, status, created_at AS "createdAt"`,
      [input.requestedBy, input.preferredDate, input.preferredTime ?? null, input.reason],
    );
    return rows[0];
  }

  async listMedicalAppointments(personId: string, executor: Queryable = this.postgres): Promise<MedicalAppointmentRow[]> {
    const { rows } = await executor.query(
      `SELECT id, requested_by AS "requestedBy", preferred_date AS "preferredDate", preferred_time AS "preferredTime", reason, status, created_at AS "createdAt"
       FROM campus_medical_appointment WHERE requested_by = $1 ORDER BY created_at DESC`,
      [personId],
    );
    return rows;
  }

  async createCopyCenterOrder(
    input: { requestedBy: string; description: string; quantity?: number | null; neededBy?: string | null },
    executor: Queryable = this.postgres,
  ): Promise<CopyCenterOrderRow> {
    const { rows } = await executor.query(
      `INSERT INTO campus_copy_center_order (requested_by, description, quantity, needed_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, requested_by AS "requestedBy", description, quantity, needed_by AS "neededBy", status, created_at AS "createdAt"`,
      [input.requestedBy, input.description, input.quantity ?? null, input.neededBy ?? null],
    );
    return rows[0];
  }

  async listCopyCenterOrders(personId: string, executor: Queryable = this.postgres): Promise<CopyCenterOrderRow[]> {
    const { rows } = await executor.query(
      `SELECT id, requested_by AS "requestedBy", description, quantity, needed_by AS "neededBy", status, created_at AS "createdAt"
       FROM campus_copy_center_order WHERE requested_by = $1 ORDER BY created_at DESC`,
      [personId],
    );
    return rows;
  }

  async createStationeryOrder(
    input: { requestedBy: string; items: string; notes?: string | null },
    executor: Queryable = this.postgres,
  ): Promise<StationeryOrderRow> {
    const { rows } = await executor.query(
      `INSERT INTO campus_stationery_order (requested_by, items, notes)
       VALUES ($1, $2, $3)
       RETURNING id, requested_by AS "requestedBy", items, notes, status, created_at AS "createdAt"`,
      [input.requestedBy, input.items, input.notes ?? null],
    );
    return rows[0];
  }

  async listStationeryOrders(personId: string, executor: Queryable = this.postgres): Promise<StationeryOrderRow[]> {
    const { rows } = await executor.query(
      `SELECT id, requested_by AS "requestedBy", items, notes, status, created_at AS "createdAt"
       FROM campus_stationery_order WHERE requested_by = $1 ORDER BY created_at DESC`,
      [personId],
    );
    return rows;
  }

  async createFeedback(
    input: { submittedBy: string; category: string; message: string },
    executor: Queryable = this.postgres,
  ): Promise<FeedbackRow> {
    const { rows } = await executor.query(
      `INSERT INTO campus_feedback (submitted_by, category, message)
       VALUES ($1, $2, $3)
       RETURNING id, submitted_by AS "submittedBy", category, message, created_at AS "createdAt"`,
      [input.submittedBy, input.category, input.message],
    );
    return rows[0];
  }

  async listFeedback(personId: string, executor: Queryable = this.postgres): Promise<FeedbackRow[]> {
    const { rows } = await executor.query(
      `SELECT id, submitted_by AS "submittedBy", category, message, created_at AS "createdAt"
       FROM campus_feedback WHERE submitted_by = $1 ORDER BY created_at DESC`,
      [personId],
    );
    return rows;
  }
}
