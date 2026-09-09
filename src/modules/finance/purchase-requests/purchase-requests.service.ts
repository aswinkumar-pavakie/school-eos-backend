// Purchase Requests (GOODS) / Service Requests (SERVICE) — Principal raises one, it
// routes through the generic approvals engine to a single FINANCE step ("the request
// should go directly, securely, to Finance"), and once approved Finance tracks its
// physical fulfillment via the linked purchase_order. See database/migrations/
// 0004_purchase_requests.sql for why this is a new feature, not brain's own unrelated
// "SOP / POP" (Policy Documents).

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { ApprovalsService } from '../../approvals/approvals.service';
import {
  PurchaseOrderRepository,
  PurchaseOrderRow,
  PurchaseOrderStage,
  PurchaseOrderSummary,
} from './repositories/purchase-order.repository';
import {
  PurchaseRequestRepository,
  PurchaseRequestRow,
  PurchaseRequestSummary,
} from './repositories/purchase-request.repository';

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly requestRepo: PurchaseRequestRepository,
    private readonly orderRepo: PurchaseOrderRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** approvalRequestType/actorRoleCode default to Finance's own original routing
   * (Principal raises -> Finance approves) so every existing caller's behaviour is
   * unchanged; MediaIndentsController passes 'MEDIA_INDENT'/'MEDIA_ROOM' instead,
   * which resolves to the separate policy seeded in 0006_media_room.sql (straight
   * to Principal, no Finance step) — same requestRepo/approvalsService underneath,
   * same registered 'purchase_request' approval handler either way. */
  async create(
    input: {
      requestType: 'GOODS' | 'SERVICE';
      itemName: string;
      description?: string;
      quantity?: number;
      vendorName?: string;
      estimatedAmountPaise?: string;
      neededBy?: string;
      departmentId?: string;
    },
    actor: AuthenticatedUser,
    context: { approvalRequestType: string; actorRoleCode: string } = {
      approvalRequestType: 'PURCHASE_REQUEST',
      actorRoleCode: 'PRINCIPAL',
    },
  ): Promise<PurchaseRequestRow> {
    return this.unitOfWork.run(async (client) => {
      const request = await this.requestRepo.create(
        { ...input, requestedBy: actor.personId },
        client,
      );
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: context.approvalRequestType,
          subjectObjectType: 'purchase_request',
          subjectObjectId: request.id,
          requestedBy: actor.personId,
          amountPaise: input.estimatedAmountPaise,
          payload: {
            itemName: input.itemName,
            quantity: input.quantity,
            vendorName: input.vendorName,
          },
        },
        client,
      );
      await this.requestRepo.linkApprovalRequest(
        request.id,
        approvalRequest.id,
        client,
      );
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: context.actorRoleCode,
          action: 'PURCHASE_REQUEST_CREATED',
          objectType: 'purchase_request',
          objectId: request.id,
          outcome: 'SUCCESS',
          afterData: input,
        },
        client,
      );
      return { ...request, approvalRequestId: approvalRequest.id };
    });
  }

  async list(
    filter: {
      state?: string;
      requestType?: string;
      departmentId?: string;
      search?: string;
    },
    page: PageQuery,
    actor: AuthenticatedUser,
  ) {
    // Finance/Admin see everything; every other caller (Principal, Media Room) sees
    // only what they themselves raised.
    const seesAll =
      actor.roles.includes('FINANCE') || actor.roles.includes('ADMIN');
    return this.requestRepo.list(
      { ...filter, requestedBy: seesAll ? undefined : actor.personId },
      page,
    );
  }

  /** Real, DB-computed KPI numbers for the POP/SOP Approval dashboard — never a client-side reduce over a page. */
  async summary(
    requestType: 'GOODS' | 'SERVICE',
  ): Promise<PurchaseRequestSummary> {
    return this.requestRepo.summary(requestType);
  }

  async getById(
    id: string,
  ): Promise<{ request: PurchaseRequestRow; order: PurchaseOrderRow | null }> {
    const request = await this.requestRepo.findById(id);
    if (!request) throw new NotFoundException('Purchase request not found');
    const order = await this.orderRepo.findByPurchaseRequestId(id);
    return { request, order };
  }

  async listOrders(
    filter: { stage?: string; requestType?: string; search?: string },
    page: PageQuery,
  ) {
    return this.orderRepo.list(filter, page);
  }

  /** Real, DB-computed KPI numbers for the POP/SOP tracking board. */
  async ordersSummary(
    requestType: 'GOODS' | 'SERVICE',
  ): Promise<PurchaseOrderSummary> {
    return this.orderRepo.summary(requestType);
  }

  async getOrderById(id: string): Promise<{
    order: PurchaseOrderRow;
    events: Awaited<ReturnType<PurchaseOrderRepository['listEvents']>>;
  }> {
    const order = await this.orderRepo.findById(id);
    if (!order) throw new NotFoundException('Purchase order not found');
    const events = await this.orderRepo.listEvents(id);
    return { order, events };
  }

  async updateOrderStage(
    id: string,
    input: {
      stage: PurchaseOrderStage;
      quantityDelivered?: number;
      note?: string;
    },
    actor: AuthenticatedUser,
  ): Promise<PurchaseOrderRow> {
    return this.unitOfWork.run(async (client) => {
      const order = await this.orderRepo.findByIdForUpdate(id, client);
      if (!order) throw new NotFoundException('Purchase order not found');
      if (
        input.quantityDelivered !== undefined &&
        input.quantityDelivered > order.quantityOrdered
      ) {
        throw new ConflictException(
          'Quantity delivered cannot exceed quantity ordered',
        );
      }
      const updated = await this.orderRepo.updateStage(id, input, client);
      await this.orderRepo.createEvent(
        {
          purchaseOrderId: id,
          stage: input.stage,
          quantityDelivered: input.quantityDelivered,
          note: input.note,
          recordedBy: actor.personId,
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'PURCHASE_ORDER_STAGE_UPDATED',
          objectType: 'purchase_order',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: input,
        },
        client,
      );
      return updated;
    });
  }

  /** "Allotted to faculty" — hand over delivered stock; bounded by quantity_delivered, DB-enforced. */
  async allotOrder(
    id: string,
    input: { quantity: number; note?: string },
    actor: AuthenticatedUser,
  ): Promise<PurchaseOrderRow> {
    return this.unitOfWork.run(async (client) => {
      const order = await this.orderRepo.findByIdForUpdate(id, client);
      if (!order) throw new NotFoundException('Purchase order not found');
      if (order.quantityAllotted + input.quantity > order.quantityDelivered) {
        throw new ConflictException(
          'Allotment cannot exceed what has been delivered',
        );
      }
      const updated = await this.orderRepo.addAllotted(
        id,
        input.quantity,
        client,
      );
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'PURCHASE_ORDER_ALLOTTED',
          objectType: 'purchase_order',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: input,
        },
        client,
      );
      return updated;
    });
  }
}
