// Registers Finance's subject_object_type handlers with the generic approvals engine
// (see modules/approvals/subject-state.registry.ts) at startup. This is the seam that
// lets ApprovalsService.decide() flip a refund's, fee structure's, or purchase
// request's own state in the same transaction as the decision, without the generic
// engine knowing anything about Finance's tables.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { simpleStateColumnHandler, SubjectStateRegistry } from '../approvals/subject-state.registry';
import { PurchaseOrderRepository } from './purchase-requests/repositories/purchase-order.repository';
import { PurchaseRequestRepository } from './purchase-requests/repositories/purchase-request.repository';

@Injectable()
export class FinanceApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly purchaseRequestRepo: PurchaseRequestRepository,
    private readonly purchaseOrderRepo: PurchaseOrderRepository,
  ) {}

  onModuleInit(): void {
    // refund's real state machine has a distinct terminal 'PROCESSED' state reached
    // only via Finance's own POST /finance/refunds/:id/process (money actually sent) —
    // APPROVED here just means "cleared to pay", so onApproved must NOT set
    // processed_at (the DB's payment-style ts-pairing convention doesn't apply to
    // refund's processed_at, but semantically it should still only date the terminal
    // step). onRejected IS terminal, so it does set processed_at.
    this.registry.register('refund', {
      onApproved: async (id, executor, _decidedBy) => {
        await executor.query(`UPDATE refund SET state = 'APPROVED' WHERE id = $1`, [id]);
      },
      onRejected: async (id, executor, _decidedBy) => {
        await executor.query(`UPDATE refund SET state = 'REJECTED', processed_at = now() WHERE id = $1`, [id]);
      },
    });
    this.registry.register('expense', simpleStateColumnHandler('expense'));
    this.registry.register('concession', simpleStateColumnHandler('concession'));
    this.registry.register('fee_structure', {
      onApproved: async (id, executor, _decidedBy) => {
        await executor.query(`UPDATE fee_structure SET state = 'ACTIVE' WHERE id = $1`, [id]);
      },
      onRejected: async (id, executor, _decidedBy) => {
        await executor.query(`UPDATE fee_structure SET state = 'DRAFT' WHERE id = $1`, [id]);
      },
    });

    // Principal raises a purchase_request; Finance is the sole approval step
    // (see 0004_purchase_requests.sql's PURCHASE_REQUEST policy). The moment it's
    // approved we auto-create the linked purchase_order so Finance can immediately
    // start tracking fulfillment (Ordered -> Dispatched -> In Transit -> Delivered),
    // using the approver's own personId as the order's created_by.
    this.registry.register('purchase_request', {
      onApproved: async (id, executor, decidedBy) => {
        await this.purchaseRequestRepo.setState(id, 'APPROVED', executor);
        const request = await this.purchaseRequestRepo.findById(id, executor);
        const order = await this.purchaseOrderRepo.create(
          {
            purchaseRequestId: id,
            quantityOrdered: request?.quantity ?? 1,
            createdBy: decidedBy,
          },
          executor,
        );
        // Seeds the order's own history timeline with a real first entry — otherwise
        // the tracking board's "Details" panel would show an empty history for every
        // order until its first manual stage update.
        await this.purchaseOrderRepo.createEvent(
          {
            purchaseOrderId: order.id,
            stage: 'ORDERED',
            note: 'Order placed on Finance approval',
            recordedBy: decidedBy,
          },
          executor,
        );
      },
      onRejected: async (id, executor, _decidedBy) => {
        await this.purchaseRequestRepo.setState(id, 'REJECTED', executor);
      },
      onWithdrawn: async (id, executor) => {
        await this.purchaseRequestRepo.setState(id, 'CANCELLED', executor);
      },
    });
  }
}
