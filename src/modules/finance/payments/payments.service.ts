// 2.4 Payment, 2.5 Payment Allocation, 2.6 Receipt, 2.7 Refund.
//
// Load-bearing rule from the API doc's Finance contract notes (section 4.1), enforced
// structurally, not just by convention: a payment is marked CONFIRMED only by an
// offline mode being recorded directly by Finance (createOfflineConfirmed) or by the
// webhook (confirmFromWebhook) — there is no third code path, no "client says success"
// handler anywhere in this service.

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../../common/audit/audit.service';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { FINANCE_ERRORS } from '../../../common/errors/error-codes';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { ApprovalsService } from '../../approvals/approvals.service';
import { SchoolProfileRepository, SchoolProfileRow } from '../master-data/repositories/school-profile.repository';
import { FeeDemandRepository } from '../obligations/repositories/fee-demand.repository';
import { StudentLedgerRow, StudentLookupRepository } from '../students/repositories/student-lookup.repository';
import { PaymentAllocationRepository, ReceiptLineItemRow } from './repositories/payment-allocation.repository';
import { PaymentListRow, PaymentRepository, PaymentRow } from './repositories/payment.repository';
import { ReceiptRepository, ReceiptRow } from './repositories/receipt.repository';
import { RefundRepository, RefundRow } from './repositories/refund.repository';

export interface ReceiptDetail {
  receipt: ReceiptRow;
  payment: PaymentRow;
  student: StudentLedgerRow | null;
  lineItems: ReceiptLineItemRow[];
  school: SchoolProfileRow | null;
}

function financialYearFor(date: Date): string {
  // April-March Indian school financial year, e.g. 2025-26.
  const year = date.getUTCFullYear();
  const isBeforeApril = date.getUTCMonth() < 3;
  const startYear = isBeforeApril ? year - 1 : year;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly allocationRepo: PaymentAllocationRepository,
    private readonly receiptRepo: ReceiptRepository,
    private readonly refundRepo: RefundRepository,
    private readonly feeDemandRepo: FeeDemandRepository,
    private readonly studentLookupRepo: StudentLookupRepository,
    private readonly schoolProfileRepo: SchoolProfileRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly configService: ConfigService,
  ) {}

  /** Everything a printable receipt needs, assembled from real rows only: the
   * receipt itself, the payment it came from (mode, and for DD the bank/reference
   * this session's own Payments work repurposed gateway/gatewayRef to carry), the
   * student it's for, its real fee-head line items, and the school's own profile
   * for the header — never a placeholder institution name. */
  async getReceiptDetail(receiptId: string): Promise<ReceiptDetail> {
    const receipt = await this.receiptRepo.findById(receiptId);
    if (!receipt) throw new NotFoundException('Receipt not found');
    const payment = await this.paymentRepo.findById(receipt.paymentId);
    if (!payment) throw new NotFoundException(FINANCE_ERRORS.PAYMENT_NOT_FOUND);
    const [student, lineItems, school] = await Promise.all([
      this.studentLookupRepo.getById(receipt.studentId),
      this.allocationRepo.listLineItemsForReceipt(receipt.paymentId, receipt.studentId),
      this.schoolProfileRepo.get(),
    ]);
    return { receipt, payment, student, lineItems, school };
  }

  async list(
    filter: { state?: string; mode?: string; studentSearch?: string; fromDate?: string; toDate?: string },
    page: PageQuery,
  ) {
    return this.paymentRepo.list(filter, page);
  }

  /** Payment History tab (all modes) / Education Loan DD tab (mode=DD only) of the Student Workspace. */
  async listForStudent(studentId: string, filter: { mode?: string } = {}): Promise<PaymentListRow[]> {
    return this.paymentRepo.listForStudent(studentId, filter);
  }

  /** Global "Education Loan DD" nav page — across every student. */
  async listAllEducationLoanDDs(filter: { search?: string; state?: string }, page: PageQuery) {
    return this.paymentRepo.listAllEducationLoanDDs(filter, page);
  }

  async getById(id: string): Promise<PaymentRow> {
    const payment = await this.paymentRepo.findById(id);
    if (!payment) throw new NotFoundException(FINANCE_ERRORS.PAYMENT_NOT_FOUND);
    return payment;
  }

  async create(
    input: { amountPaise: string; mode: string; paidByPersonId?: string; idempotencyKey: string; gateway?: string },
    actor: AuthenticatedUser,
  ): Promise<PaymentRow> {
    const existing = await this.paymentRepo.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    try {
      if (this.paymentRepo.isOfflineMode(input.mode)) {
        return await this.paymentRepo.createOfflineConfirmed({
          paidByPersonId: input.paidByPersonId ?? null,
          amountPaise: input.amountPaise,
          mode: input.mode,
          idempotencyKey: input.idempotencyKey,
          collectedBy: actor.personId,
        });
      }
      if (!input.gateway) {
        throw new ConflictException('gateway is required for a gateway-mediated payment mode');
      }
      return await this.paymentRepo.createIntent({
        paidByPersonId: input.paidByPersonId ?? null,
        amountPaise: input.amountPaise,
        mode: input.mode,
        gateway: input.gateway,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await this.paymentRepo.findByIdempotencyKey(input.idempotencyKey);
        if (raced) return raced;
      }
      throw err;
    }
  }

  /**
   * The Student Workspace's single-step "Receive Payment" action: create the payment
   * AND allocate it to one specific obligation, atomically — unlike `create` +
   * `allocate` as two separate calls (still available for the general/unscoped
   * Payments list, e.g. a payment that covers several students at once). Offline
   * modes only (CASH/CHEQUE/DD) — this is Finance physically receiving money at the
   * counter for a named student, not a gateway intent.
   *
   * DD is NOT treated like CASH/CHEQUE: a demand draft can bounce, so it starts
   * PENDING ("received", the bank hasn't cleared it) rather than instantly CONFIRMED.
   * The allocation link is recorded now (so the workspace can show which obligation
   * this DD is against), but the obligation's own paid_paise is only updated — and the
   * receipt only generated — once markDDCleared runs. A pending DD's amount is
   * therefore a known gap in the balance check on other allocations against the same
   * obligation until it clears or is known to have bounced (see Finance README).
   */
  async receiveStudentPayment(
    studentId: string,
    input: {
      feeDemandId: string;
      amountPaise: string;
      mode: string;
      idempotencyKey: string;
      bankName?: string;
      ddReferenceNo?: string;
    },
    actor: AuthenticatedUser,
  ): Promise<{ payment: PaymentRow; receipt: ReceiptRow | null }> {
    if (!this.paymentRepo.isOfflineMode(input.mode)) {
      throw new ConflictException('Receive Payment only accepts CASH, CHEQUE or DD — use a payment intent for gateway-mediated modes');
    }
    const isDD = input.mode === 'DD';

    const existing = await this.paymentRepo.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const receipt = await this.receiptRepo.findByPaymentAndStudent(existing.id, studentId);
      return { payment: existing, receipt };
    }

    const paymentId = await this.unitOfWork.run(async (client) => {
      const demand = await this.feeDemandRepo.findByIdForUpdate(input.feeDemandId, client);
      if (!demand) throw new NotFoundException(FINANCE_ERRORS.FEE_DEMAND_NOT_FOUND);
      if (demand.studentId !== studentId) {
        throw new ConflictException('This obligation does not belong to the selected student');
      }
      const balance = BigInt(demand.amountPaise) + BigInt(demand.lateFeePaise) - BigInt(demand.paidPaise);
      if (BigInt(input.amountPaise) > balance) {
        throw new ConflictException(FINANCE_ERRORS.ALLOCATION_EXCEEDS_DEMAND);
      }

      let payment: PaymentRow;
      try {
        const createInput = {
          paidByPersonId: null,
          amountPaise: input.amountPaise,
          mode: input.mode,
          idempotencyKey: input.idempotencyKey,
          collectedBy: actor.personId,
          gateway: isDD ? input.bankName ?? null : null,
          gatewayRef: isDD ? input.ddReferenceNo ?? null : null,
        };
        payment = isDD
          ? await this.paymentRepo.createOfflinePending(createInput, client)
          : await this.paymentRepo.createOfflineConfirmed(createInput, client);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(
            isDD
              ? 'A payment with this bank + DD reference number already exists'
              : 'A payment with this idempotency key already exists',
          );
        }
        throw err;
      }

      await this.allocationRepo.create(payment.id, input.feeDemandId, input.amountPaise, client);
      // A pending DD doesn't move money yet — only a confirmed payment reduces what
      // the student still owes.
      if (!isDD) {
        await this.feeDemandRepo.applyAllocation(input.feeDemandId, input.amountPaise, client);
      }

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'STUDENT_PAYMENT_RECEIVED',
          objectType: 'payment',
          objectId: payment.id,
          outcome: 'SUCCESS',
          afterData: { studentId, feeDemandId: input.feeDemandId, amountPaise: input.amountPaise, mode: input.mode },
        },
        client,
      );

      return payment.id;
    });

    if (isDD) {
      // No receipt yet — a receipt is proof of confirmed payment, and this DD hasn't
      // cleared. markDDCleared generates it once it does.
      return { payment: (await this.paymentRepo.findById(paymentId))!, receipt: null };
    }
    const receipt = await this.generateReceiptForStudent(paymentId, studentId);
    const payment = await this.paymentRepo.findById(paymentId);
    return { payment: payment!, receipt };
  }

  /** Finance confirms the bank has honoured the DD — PENDING -> CONFIRMED, only now applying it to the obligation's paid_paise and generating the receipt. */
  async markDDCleared(paymentId: string, actor: AuthenticatedUser): Promise<{ payment: PaymentRow; receipt: ReceiptRow | null }> {
    const studentId = await this.unitOfWork.run(async (client) => {
      const payment = await this.paymentRepo.findByIdForUpdate(paymentId, client);
      if (!payment) throw new NotFoundException(FINANCE_ERRORS.PAYMENT_NOT_FOUND);
      if (payment.mode !== 'DD' || payment.state !== 'PENDING') {
        throw new ConflictException('Only a PENDING DD payment can be marked cleared');
      }

      const allocations = await this.allocationRepo.listByPayment(paymentId, client);
      let studentId: string | null = null;
      for (const allocation of allocations) {
        const demand = await this.feeDemandRepo.findByIdForUpdate(allocation.feeDemandId, client);
        if (!demand) continue;
        studentId = demand.studentId;
        await this.feeDemandRepo.applyAllocation(allocation.feeDemandId, allocation.amountPaise, client);
      }

      await this.paymentRepo.markCleared(paymentId, client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'EDUCATION_LOAN_DD_CLEARED',
          objectType: 'payment',
          objectId: paymentId,
          outcome: 'SUCCESS',
        },
        client,
      );
      return studentId;
    });

    const receipt = studentId ? await this.generateReceiptForStudent(paymentId, studentId) : null;
    const payment = await this.paymentRepo.findById(paymentId);
    return { payment: payment!, receipt };
  }

  /**
   * The payment-events webhook. Never throws for "unknown payment" or a replayed
   * event — both ack with 200 per the documented contract; only a structurally
   * malformed situation this handler can't reason about should ever 5xx.
   */
  async handleWebhookEvent(event: {
    eventId: string;
    gateway: string;
    gatewayRef: string;
    paymentReference: string;
    amountPaise: string;
    status: 'CONFIRMED' | 'FAILED';
    // Real method the payer used inside the gateway's own checkout, when the
    // gateway's adapter can report one (see markConfirmedFromWebhook).
    mode?: string;
  }): Promise<{ acknowledged: true; matched: boolean }> {
    return this.unitOfWork.run(async (client) => {
      let payment = await this.paymentRepo.findByGatewayRef(event.gateway, event.gatewayRef, client);
      if (!payment) {
        payment = await this.paymentRepo.findByIdempotencyKeyForUpdate(event.paymentReference, client);
      } else {
        // Re-lock the already-found row for the update below.
        payment = await this.paymentRepo.findByIdForUpdate(payment.id, client);
      }

      if (!payment) {
        // Unknown reference: acknowledge, don't reject — it surfaces later as an
        // unmatched entry the next time Finance runs a reconciliation pass.
        return { acknowledged: true, matched: false };
      }

      // Replay: this exact event already applied (gateway_ref already stored and the
      // payment already reached a terminal state) — return the same outcome, no
      // further state change, per the documented idempotency contract.
      if (payment.gatewayRef === event.gatewayRef && ['CONFIRMED', 'FAILED'].includes(payment.state)) {
        return { acknowledged: true, matched: true };
      }

      // Stale/out-of-order event for an already-terminal payment: acknowledge and
      // discard rather than move state backwards.
      if (['CONFIRMED', 'FAILED'].includes(payment.state)) {
        return { acknowledged: true, matched: true };
      }

      if (event.status === 'CONFIRMED') {
        await this.paymentRepo.markConfirmedFromWebhook(payment.id, event.gateway, event.gatewayRef, client, event.mode ?? null);
      } else {
        await this.paymentRepo.markFailedFromWebhook(payment.id, 'Gateway reported failure', client);
      }

      await this.audit.record(
        {
          actorPersonId: null,
          actorRoleCode: null,
          action: `PAYMENT_WEBHOOK_${event.status}`,
          objectType: 'payment',
          objectId: payment.id,
          outcome: event.status === 'CONFIRMED' ? 'SUCCESS' : 'ERROR',
          correlationId: null,
          afterData: { eventId: event.eventId, gatewayRef: event.gatewayRef },
        },
        client,
      );

      if (payment.paidByPersonId) {
        await this.outbox.enqueue(
          {
            personId: payment.paidByPersonId,
            notificationType: `PAYMENT_${event.status}`,
            title: event.status === 'CONFIRMED' ? 'Payment confirmed' : 'Payment failed',
            body:
              event.status === 'CONFIRMED'
                ? 'Your payment was confirmed by the bank.'
                : 'Your payment could not be completed.',
            relatedObjectType: 'payment',
            relatedObjectId: payment.id,
          },
          client,
        );
      }

      return { acknowledged: true, matched: true };
    });
  }

  async allocate(
    paymentId: string,
    lines: { feeDemandId: string; amountPaise: string }[],
  ): Promise<{ allocations: unknown[]; receipts: ReceiptRow[] }> {
    const receipts = await this.unitOfWork.run(async (client) => {
      const payment = await this.paymentRepo.findByIdForUpdate(paymentId, client);
      if (!payment) throw new NotFoundException(FINANCE_ERRORS.PAYMENT_NOT_FOUND);
      if (payment.state !== 'CONFIRMED') {
        throw new ConflictException(FINANCE_ERRORS.PAYMENT_NOT_CONFIRMED);
      }

      const alreadyAllocated = BigInt(await this.allocationRepo.sumAllocatedForPayment(paymentId, client));
      // findByIdForUpdate above already holds this payment row's lock for the rest of
      // this transaction, so this check-then-act is race-free even under a retried/
      // duplicated gateway webhook calling this twice for the same payment (the
      // second caller blocks on the row lock until the first commits, then sees a
      // non-zero alreadyAllocated and stops here instead of double-applying money).
      if (alreadyAllocated > 0n) {
        return this.allocationRepo.listDistinctStudentsForPayment(paymentId, client);
      }

      const newTotal = lines.reduce((sum, l) => sum + BigInt(l.amountPaise), 0n);
      if (alreadyAllocated + newTotal > BigInt(payment.amountPaise)) {
        throw new ConflictException(FINANCE_ERRORS.ALLOCATION_EXCEEDS_PAYMENT);
      }

      for (const line of lines) {
        const demand = await this.feeDemandRepo.findByIdForUpdate(line.feeDemandId, client);
        if (!demand) throw new NotFoundException(FINANCE_ERRORS.FEE_DEMAND_NOT_FOUND);
        const balance = BigInt(demand.amountPaise) + BigInt(demand.lateFeePaise) - BigInt(demand.paidPaise);
        if (BigInt(line.amountPaise) > balance) {
          throw new ConflictException(FINANCE_ERRORS.ALLOCATION_EXCEEDS_DEMAND);
        }
        await this.allocationRepo.create(paymentId, line.feeDemandId, line.amountPaise, client);
        await this.feeDemandRepo.applyAllocation(line.feeDemandId, line.amountPaise, client);
      }

      await this.audit.record(
        {
          actorPersonId: payment.collectedBy ?? payment.paidByPersonId,
          actorRoleCode: 'FINANCE',
          action: 'PAYMENT_ALLOCATED',
          objectType: 'payment',
          objectId: paymentId,
          outcome: 'SUCCESS',
          afterData: { lines },
        },
        client,
      );

      // Must read via `client` (the still-open transaction), not the default pool —
      // the allocation rows just inserted above aren't visible to any other
      // connection until this transaction commits. Receipt generation itself still
      // runs as a distinct step after commit (see 2.6: "never inline in the payment
      // transaction itself") — only this student lookup needs to see this
      // transaction's own uncommitted write.
      return this.allocationRepo.listDistinctStudentsForPayment(paymentId, client);
    });

    const generated: ReceiptRow[] = [];
    for (const studentId of receipts) {
      generated.push(await this.generateReceiptForStudent(paymentId, studentId));
    }
    return { allocations: await this.allocationRepo.listByPayment(paymentId), receipts: generated };
  }

  async listReceipts(paymentId: string): Promise<ReceiptRow[]> {
    return this.receiptRepo.listByPayment(paymentId);
  }

  async generateReceipts(paymentId: string): Promise<ReceiptRow[]> {
    const students = await this.allocationRepo.listDistinctStudentsForPayment(paymentId);
    const results: ReceiptRow[] = [];
    for (const studentId of students) {
      const existing = await this.receiptRepo.findByPaymentAndStudent(paymentId, studentId);
      results.push(existing ?? (await this.generateReceiptForStudent(paymentId, studentId)));
    }
    return results;
  }

  private async generateReceiptForStudent(paymentId: string, studentId: string): Promise<ReceiptRow> {
    const existing = await this.receiptRepo.findByPaymentAndStudent(paymentId, studentId);
    if (existing) return existing;

    const amountPaise = await this.allocationRepo.sumAllocatedForPaymentAndStudent(paymentId, studentId);
    const financialYear = financialYearFor(new Date());

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.unitOfWork.run(async (client) => {
          const seq = (await this.receiptRepo.countForFinancialYear(financialYear, client)) + 1 + attempt;
          const receiptNo = `RC-${financialYear}-${String(seq).padStart(6, '0')}`;
          return this.receiptRepo.create(
            { paymentId, studentId, receiptNo, financialYear, amountPaise },
            client,
          );
        });
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 2) throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique receipt number');
  }

  async createRefund(
    paymentId: string,
    input: { studentId: string; amountPaise: string; reason: string },
    actor: AuthenticatedUser,
  ): Promise<RefundRow> {
    const threshold = BigInt(
      this.configService.get<string>('finance.refundAutoApproveThresholdPaise') ?? '0',
    );
    const amount = BigInt(input.amountPaise);

    return this.unitOfWork.run(async (client) => {
      const payment = await this.paymentRepo.findByIdForUpdate(paymentId, client);
      if (!payment) throw new NotFoundException(FINANCE_ERRORS.PAYMENT_NOT_FOUND);

      const refund = await this.refundRepo.create(
        { paymentId, studentId: input.studentId, amountPaise: input.amountPaise, reason: input.reason },
        client,
      );

      if (amount > threshold) {
        const approvalRequest = await this.approvalsService.createRequest(
          {
            requestType: 'REFUND',
            subjectObjectType: 'refund',
            subjectObjectId: refund.id,
            requestedBy: actor.personId,
            amountPaise: input.amountPaise,
            payload: { reason: input.reason, studentId: input.studentId },
          },
          client,
        );
        await this.refundRepo.linkApprovalRequest(refund.id, approvalRequest.id, client);
      } else {
        // Below threshold: Finance's own authority clears it directly, no approval
        // chain — see 2.7: "below threshold, Finance can process it directly." Still
        // not PROCESSED yet — that's a separate payout-confirmation step (see process()).
        await this.refundRepo.autoApprove(refund.id, client);
      }

      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'REFUND_CREATED',
          objectType: 'refund',
          objectId: refund.id,
          outcome: 'SUCCESS',
          afterData: { ...input, status: amount > threshold ? 'PENDING_APPROVAL' : 'AUTO_APPROVED' },
        },
        client,
      );

      return (await this.refundRepo.findById(refund.id, client))!;
    });
  }

  async getRefundById(id: string): Promise<RefundRow> {
    const refund = await this.refundRepo.findById(id);
    if (!refund) throw new NotFoundException(FINANCE_ERRORS.REFUND_NOT_FOUND);
    return refund;
  }

  async listRefundsForPayment(paymentId: string): Promise<RefundRow[]> {
    return this.refundRepo.listByPayment(paymentId);
  }

  /** Finance confirms the money has actually been sent back — the real terminal step, distinct from APPROVED ("cleared to pay"). */
  async processRefundPayout(id: string, actor: AuthenticatedUser): Promise<RefundRow> {
    return this.unitOfWork.run(async (client) => {
      const refund = await this.refundRepo.findByIdForUpdate(id, client);
      if (!refund) throw new NotFoundException(FINANCE_ERRORS.REFUND_NOT_FOUND);
      if (refund.state !== 'APPROVED') {
        throw new ConflictException('Only an APPROVED refund can be marked as processed');
      }
      await this.refundRepo.markPayoutProcessed(id, client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'REFUND_PAYOUT_PROCESSED',
          objectType: 'refund',
          objectId: id,
          outcome: 'SUCCESS',
        },
        client,
      );
      return (await this.refundRepo.findById(id, client))!;
    });
  }
}
