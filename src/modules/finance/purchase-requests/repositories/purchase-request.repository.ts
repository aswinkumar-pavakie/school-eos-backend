import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../../infrastructure/postgres/postgres.service';
import {
  PageQuery,
  toOffsetLimit,
} from '../../../../common/pagination/pagination.util';

export type PurchaseRequestType = 'GOODS' | 'SERVICE';
export type PurchaseRequestState =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PurchaseRequestRow {
  id: string;
  referenceNo: string;
  requestType: PurchaseRequestType;
  itemName: string;
  description: string | null;
  quantity: number | null;
  vendorName: string | null;
  estimatedAmountPaise: string | null;
  neededBy: Date | null;
  departmentId: string | null;
  departmentName: string | null;
  requestedBy: string;
  requestedByName: string | null;
  requestedByEmail: string | null;
  approvalRequestId: string | null;
  state: PurchaseRequestState;
  createdAt: Date;
}

export interface PurchaseRequestSummary {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  totalCount: number;
  approvedValuePaise: string;
}

function mapRow(row: any): PurchaseRequestRow {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    requestType: row.request_type,
    itemName: row.item_name,
    description: row.description,
    quantity: row.quantity,
    vendorName: row.vendor_name,
    estimatedAmountPaise: row.estimated_amount_paise,
    neededBy: row.needed_by,
    departmentId: row.department_id,
    departmentName: row.department_name ?? null,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name ?? null,
    requestedByEmail: row.requested_by_email ?? null,
    approvalRequestId: row.approval_request_id,
    state: row.state,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

const SELECT_WITH_JOINS = `
  SELECT pr.*, p.display_name AS requested_by_name, p.email AS requested_by_email, d.name AS department_name
  FROM purchase_request pr
  LEFT JOIN person p ON p.id = pr.requested_by
  LEFT JOIN department d ON d.id = pr.department_id
`;

@Injectable()
export class PurchaseRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** PI-FIN-008 (goods) / SI-FIN-002 (service) — sequential per type, retried on the rare collision (matches the receipt-numbering pattern). */
  async create(
    input: {
      requestType: PurchaseRequestType;
      itemName: string;
      description?: string | null;
      quantity?: number | null;
      vendorName?: string | null;
      estimatedAmountPaise?: string | null;
      neededBy?: string | null;
      departmentId?: string | null;
      requestedBy: string;
    },
    executor: Queryable,
  ): Promise<PurchaseRequestRow> {
    const prefix = input.requestType === 'GOODS' ? 'PI-FIN' : 'SI-FIN';
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { rows: countRows } = await executor.query(
          `SELECT COUNT(*)::int AS count FROM purchase_request WHERE request_type = $1`,
          [input.requestType],
        );
        const seq = countRows[0].count + 1 + attempt;
        const referenceNo = `${prefix}-${String(seq).padStart(3, '0')}`;
        const { rows } = await executor.query(
          `INSERT INTO purchase_request
             (reference_no, request_type, item_name, description, quantity, vendor_name,
              estimated_amount_paise, needed_by, department_id, requested_by, state)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
           RETURNING *`,
          [
            referenceNo,
            input.requestType,
            input.itemName,
            input.description ?? null,
            input.quantity ?? null,
            input.vendorName ?? null,
            input.estimatedAmountPaise ?? null,
            input.neededBy ?? null,
            input.departmentId ?? null,
            input.requestedBy,
          ],
        );
        return mapRow(rows[0]);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 4) throw err;
      }
    }
    throw new Error(
      'Could not allocate a unique purchase request reference number',
    );
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<PurchaseRequestRow | null> {
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS} WHERE pr.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<PurchaseRequestRow | null> {
    const { rows } = await executor.query(
      `SELECT * FROM purchase_request WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE purchase_request SET approval_request_id = $2 WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async setState(
    id: string,
    state: PurchaseRequestState,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE purchase_request SET state = $2, updated_at = now() WHERE id = $1`,
      [id, state],
    );
  }

  async list(
    filter: {
      state?: string;
      requestType?: string;
      requestedBy?: string;
      departmentId?: string;
      search?: string;
    },
    page: PageQuery,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: PurchaseRequestRow[]; total: number }> {
    const { offset, limit } = toOffsetLimit(page);
    const search = filter.search?.trim() ? `%${filter.search.trim()}%` : null;
    const params = [
      filter.state ?? null,
      filter.requestType ?? null,
      filter.requestedBy ?? null,
      filter.departmentId ?? null,
      search,
    ];
    const whereClause = `
      WHERE ($1::text IS NULL OR pr.state = $1)
        AND ($2::text IS NULL OR pr.request_type = $2)
        AND ($3::uuid IS NULL OR pr.requested_by = $3)
        AND ($4::uuid IS NULL OR pr.department_id = $4)
        AND ($5::text IS NULL OR pr.item_name ILIKE $5 OR pr.reference_no ILIKE $5 OR pr.vendor_name ILIKE $5 OR p.display_name ILIKE $5)
    `;
    const { rows: countRows } = await executor.query(
      `SELECT COUNT(*)::int AS total
       FROM purchase_request pr
       LEFT JOIN person p ON p.id = pr.requested_by
       ${whereClause}`,
      params,
    );
    const { rows } = await executor.query(
      `${SELECT_WITH_JOINS}
       ${whereClause}
       ORDER BY pr.created_at DESC LIMIT $6 OFFSET $7`,
      [...params, limit, offset],
    );
    return { rows: rows.map(mapRow), total: countRows[0].total };
  }

  /** Real, DB-computed aggregates for the POP/SOP Approval dashboard's KPI cards — never a client-side reduce over a capped page. */
  async summary(
    requestType: PurchaseRequestType,
    executor: Queryable = this.postgres,
  ): Promise<PurchaseRequestSummary> {
    const { rows } = await executor.query(
      `SELECT
         COUNT(*) FILTER (WHERE state = 'PENDING')::int AS pending_count,
         COUNT(*) FILTER (WHERE state = 'APPROVED')::int AS approved_count,
         COUNT(*) FILTER (WHERE state = 'REJECTED')::int AS rejected_count,
         COUNT(*) FILTER (WHERE state = 'CANCELLED')::int AS cancelled_count,
         COUNT(*)::int AS total_count,
         COALESCE(SUM(estimated_amount_paise) FILTER (WHERE state = 'APPROVED'), 0)::text AS approved_value_paise
       FROM purchase_request
       WHERE request_type = $1`,
      [requestType],
    );
    const r = rows[0];
    return {
      pendingCount: r.pending_count,
      approvedCount: r.approved_count,
      rejectedCount: r.rejected_count,
      cancelledCount: r.cancelled_count,
      totalCount: r.total_count,
      approvedValuePaise: r.approved_value_paise,
    };
  }
}
