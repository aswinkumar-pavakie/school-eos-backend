import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export type PurchaseOrderStage =
  | 'ORDERED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PART_DELIVERED'
  | 'CANCELLED';

export interface PurchaseOrderRow {
  id: string;
  purchaseRequestId: string;
  orderNo: string;
  quantityOrdered: number;
  quantityDelivered: number;
  quantityAllotted: number;
  stage: PurchaseOrderStage;
  placedOn: Date;
  expectedOn: Date | null;
  createdBy: string;
  createdAt: Date;
  /** Joined from the originating purchase_request — display-only, never written back through this row. */
  itemName?: string;
  referenceNo?: string;
  requestType?: 'GOODS' | 'SERVICE';
  description?: string | null;
  vendorName?: string | null;
  estimatedAmountPaise?: string | null;
  departmentName?: string | null;
  requestedByName?: string | null;
  requestedByEmail?: string | null;
}

export interface PurchaseOrderSummary {
  totalOrders: number;
  inProgressCount: number;
  deliveredCount: number;
  awaitingAllotmentCount: number;
  approvedValuePaise: string;
}

export interface PurchaseOrderEventRow {
  id: string;
  purchaseOrderId: string;
  stage: PurchaseOrderStage;
  quantityDelivered: number | null;
  note: string | null;
  recordedBy: string;
  recordedByEmail: string | null;
  recordedAt: Date;
}

function mapRow(row: any): PurchaseOrderRow {
  return {
    id: row.id,
    purchaseRequestId: row.purchase_request_id,
    orderNo: row.order_no,
    quantityOrdered: row.quantity_ordered,
    quantityDelivered: row.quantity_delivered,
    quantityAllotted: row.quantity_allotted,
    stage: row.stage,
    placedOn: row.placed_on,
    expectedOn: row.expected_on,
    createdBy: row.created_by,
    createdAt: row.created_at,
    itemName: row.item_name ?? undefined,
    referenceNo: row.reference_no ?? undefined,
    requestType: row.request_type ?? undefined,
    description: row.description ?? undefined,
    vendorName: row.vendor_name ?? undefined,
    estimatedAmountPaise: row.estimated_amount_paise ?? undefined,
    departmentName: row.department_name ?? undefined,
    requestedByName: row.requested_by_name ?? undefined,
    requestedByEmail: row.requested_by_email ?? undefined,
  };
}

function mapEventRow(row: any): PurchaseOrderEventRow {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    stage: row.stage,
    quantityDelivered: row.quantity_delivered,
    note: row.note,
    recordedBy: row.recorded_by,
    recordedByEmail: row.recorded_by_email ?? null,
    recordedAt: row.recorded_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

// Every read joins back to the originating purchase_request (+ its requester/department)
// — the order row itself only ever stores tracking-specific columns; everything
// descriptive ("what is this", "who asked for it", "which department") lives on the
// request and is surfaced here read-only.
const SELECT_WITH_JOINS = `
  SELECT po.*, pr.item_name, pr.reference_no, pr.request_type, pr.description, pr.vendor_name,
         pr.estimated_amount_paise, d.name AS department_name, p.display_name AS requested_by_name,
         p.email AS requested_by_email
  FROM purchase_order po
  JOIN purchase_request pr ON pr.id = po.purchase_request_id
  LEFT JOIN department d ON d.id = pr.department_id
  LEFT JOIN person p ON p.id = pr.requested_by
`;

@Injectable()
export class PurchaseOrderRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Created the moment a purchase_request is approved — never before. */
  async create(
    input: {
      purchaseRequestId: string;
      quantityOrdered: number;
      expectedOn?: string | null;
      createdBy: string;
    },
    executor: Queryable,
  ): Promise<PurchaseOrderRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { rows: countRows } = await executor.query(
          `SELECT COUNT(*)::int AS count FROM purchase_order`,
        );
        const seq = countRows[0].count + 1 + attempt;
        const orderNo = `PO-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
        const { rows } = await executor.query(
          `INSERT INTO purchase_order (purchase_request_id, order_no, quantity_ordered, expected_on, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            input.purchaseRequestId,
            orderNo,
            input.quantityOrdered,
            input.expectedOn ?? null,
            input.createdBy,
          ],
        );
        return mapRow(rows[0]);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 4) throw err;
      }
    }
    throw new Error('Could not allocate a unique purchase order number');
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<PurchaseOrderRow | null> {
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS} WHERE po.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<PurchaseOrderRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM purchase_order WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByPurchaseRequestId(
    purchaseRequestId: string,
    executor: Queryable = this.postgres,
  ): Promise<PurchaseOrderRow | null> {
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS} WHERE po.purchase_request_id = $1`,
      [purchaseRequestId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async list(
    filter: { stage?: string; requestType?: string; search?: string },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: PurchaseOrderRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const search = filter.search?.trim() ? `%${filter.search.trim()}%` : null;
    const params = [filter.stage ?? null, filter.requestType ?? null, search];
    const whereClause = `
      WHERE ($1::text IS NULL OR po.stage = $1)
        AND ($2::text IS NULL OR pr.request_type = $2)
        AND ($3::text IS NULL OR po.order_no ILIKE $3 OR pr.item_name ILIKE $3 OR pr.reference_no ILIKE $3
             OR pr.vendor_name ILIKE $3 OR p.display_name ILIKE $3)
    `;
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total
       FROM purchase_order po
       JOIN purchase_request pr ON pr.id = po.purchase_request_id
       LEFT JOIN person p ON p.id = pr.requested_by
       ${whereClause}`,
      params,
    );
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS}
       ${whereClause}
       ORDER BY po.created_at DESC LIMIT $4 OFFSET $5`,
      [...params, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  /** Real, DB-computed aggregates for the POP/SOP tracking board's KPI cards. */
  async summary(
    requestType: 'GOODS' | 'SERVICE',
    executor: Queryable = this.postgres,
  ): Promise<PurchaseOrderSummary> {
    const { rows } = await executor.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE po.stage IN ('DISPATCHED', 'IN_TRANSIT'))::int AS in_progress_count,
         COUNT(*) FILTER (WHERE po.stage IN ('DELIVERED', 'PART_DELIVERED'))::int AS delivered_count,
         COUNT(*) FILTER (WHERE po.quantity_delivered > po.quantity_allotted)::int AS awaiting_allotment_count,
         COALESCE(SUM(pr.estimated_amount_paise), 0)::text AS approved_value_paise
       FROM purchase_order po
       JOIN purchase_request pr ON pr.id = po.purchase_request_id
       WHERE pr.request_type = $1`,
      [requestType],
    );
    const r = rows[0];
    return {
      totalOrders: r.total_orders,
      inProgressCount: r.in_progress_count,
      deliveredCount: r.delivered_count,
      awaitingAllotmentCount: r.awaiting_allotment_count,
      approvedValuePaise: r.approved_value_paise,
    };
  }

  async updateStage(
    id: string,
    input: { stage: PurchaseOrderStage; quantityDelivered?: number },
    executor: Queryable,
  ): Promise<PurchaseOrderRow> {
    await executor.query(
      `UPDATE purchase_order
       SET stage = $2, quantity_delivered = COALESCE($3, quantity_delivered), updated_at = now()
       WHERE id = $1`,
      [id, input.stage, input.quantityDelivered ?? null],
    );
    return (await this.findById(id, executor))!;
  }

  async addAllotted(
    id: string,
    quantity: number,
    executor: Queryable,
  ): Promise<PurchaseOrderRow> {
    await executor.query(
      `UPDATE purchase_order SET quantity_allotted = quantity_allotted + $2, updated_at = now()
       WHERE id = $1`,
      [id, quantity],
    );
    return (await this.findById(id, executor))!;
  }

  async createEvent(
    input: {
      purchaseOrderId: string;
      stage: PurchaseOrderStage;
      quantityDelivered?: number | null;
      note?: string | null;
      recordedBy: string;
    },
    executor: Queryable,
  ): Promise<PurchaseOrderEventRow> {
    const { rows } = await executor.query(
      `INSERT INTO purchase_order_event (purchase_order_id, stage, quantity_delivered, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.purchaseOrderId,
        input.stage,
        input.quantityDelivered ?? null,
        input.note ?? null,
        input.recordedBy,
      ],
    );
    const row = rows[0];
    // Falls back to display_name — not every seeded person row has an email set, and
    // the timeline just needs a human-readable "who did this", not specifically an
    // email address.
    const { rows: personRows } = await executor.query(
      `SELECT COALESCE(email, display_name) AS identifier FROM person WHERE id = $1`,
      [input.recordedBy],
    );
    return mapEventRow({
      ...row,
      recorded_by_email: personRows[0]?.identifier ?? null,
    });
  }

  async listEvents(
    purchaseOrderId: string,
    executor: Queryable = this.postgres,
  ): Promise<PurchaseOrderEventRow[]> {
    const { rows } = await executor.query(
      `SELECT poe.*, COALESCE(p.email, p.display_name) AS recorded_by_email
       FROM purchase_order_event poe
       LEFT JOIN person p ON p.id = poe.recorded_by
       WHERE poe.purchase_order_id = $1 ORDER BY poe.recorded_at ASC`,
      [purchaseOrderId],
    );
    return rows.map(mapEventRow);
  }
}
