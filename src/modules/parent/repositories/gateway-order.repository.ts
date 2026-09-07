// database/migrations/0005_gateway_order.sql — one row per online-gateway order,
// remembering the fee_demand split it's intended for until the gateway's webhook
// confirms the payment and that split gets actually applied (see ParentFeesService).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface AllocationLine {
  feeDemandId: string;
  amountPaise: string;
}

export interface GatewayOrderRow {
  id: string;
  paymentId: string;
  studentId: string;
  gateway: string;
  gatewayOrderId: string;
  allocations: AllocationLine[];
  createdBy: string;
  createdAt: Date;
}

function mapRow(row: any): GatewayOrderRow {
  return {
    id: row.id,
    paymentId: row.payment_id,
    studentId: row.student_id,
    gateway: row.gateway,
    gatewayOrderId: row.gateway_order_id,
    allocations: row.allocations,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

@Injectable()
export class GatewayOrderRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      paymentId: string;
      studentId: string;
      gateway: string;
      gatewayOrderId: string;
      allocations: AllocationLine[];
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<GatewayOrderRow> {
    const { rows } = await executor.query(
      `INSERT INTO gateway_order (payment_id, student_id, gateway, gateway_order_id, allocations, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [input.paymentId, input.studentId, input.gateway, input.gatewayOrderId, JSON.stringify(input.allocations), input.createdBy],
    );
    return mapRow(rows[0]);
  }

  async findByGatewayOrderId(
    gateway: string,
    gatewayOrderId: string,
    executor: Queryable = this.postgres,
  ): Promise<GatewayOrderRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM gateway_order WHERE gateway = $1 AND gateway_order_id = $2`,
      [gateway, gatewayOrderId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }
}
