// The Parent app's fee payment feature — real guardian-scoped reads plus the one
// write action (start a Razorpay order). No third code path confirms a payment
// here either, same load-bearing rule as Finance's own PaymentsService: only the
// Razorpay webhook (handleRazorpayWebhook, below) ever moves a payment to
// CONFIRMED and applies it to a fee_demand — nothing here trusts "the app says the
// checkout succeeded".

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { PARENT_ERRORS } from '../../common/errors/error-codes';
import { FeeDemandRepository } from '../finance/obligations/repositories/fee-demand.repository';
import { SchoolProfileRepository } from '../finance/master-data/repositories/school-profile.repository';
import { PaymentRepository } from '../finance/payments/repositories/payment.repository';
import { PaymentsService } from '../finance/payments/payments.service';
import { CreateRazorpayOrderDto } from './dto/create-razorpay-order.dto';
import { AllocationLine, GatewayOrderRepository } from './repositories/gateway-order.repository';
import { FeeLineRow, ParentFeeRepository } from './repositories/parent-fee.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { RazorpayService } from './razorpay/razorpay.service';

const PAYABLE_STATES = ['PENDING', 'PARTIAL', 'OVERDUE'];

function mapRazorpayMethod(method: unknown): string | null {
  switch (method) {
    case 'card':
      return 'CARD';
    case 'netbanking':
      return 'NETBANKING';
    case 'upi':
      return 'UPI';
    default:
      // wallet/emi/paylater have no honest equivalent in payment_mode_check — left
      // unset (mode stays whatever the intent was created with) rather than
      // mislabelling one of those as something it isn't.
      return null;
  }
}

/** Splits `amountPaise` sequentially across the given lines, in the order the
 * parent selected them, each capped at its own real outstanding balance — never
 * more. Left-over amount (should never happen once the caller has validated total
 * <= sum(balances)) is simply not allocated. */
function splitAllocation(lines: FeeLineRow[], orderedIds: string[], amountPaise: string): AllocationLine[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  let remaining = BigInt(amountPaise);
  const result: AllocationLine[] = [];
  for (const id of orderedIds) {
    if (remaining <= 0n) break;
    const line = byId.get(id);
    if (!line) continue;
    const balance = BigInt(line.amountPaise) + BigInt(line.lateFeePaise) - BigInt(line.paidPaise);
    const take = remaining < balance ? remaining : balance;
    if (take > 0n) {
      result.push({ feeDemandId: id, amountPaise: take.toString() });
      remaining -= take;
    }
  }
  return result;
}

@Injectable()
export class ParentFeesService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly parentFeeRepo: ParentFeeRepository,
    private readonly gatewayOrderRepo: GatewayOrderRepository,
    private readonly feeDemandRepo: FeeDemandRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly paymentsService: PaymentsService,
    private readonly schoolProfileRepo: SchoolProfileRepository,
    private readonly razorpayService: RazorpayService,
    private readonly audit: AuditService,
  ) {}

  private async assertCanView(personId: string, studentId: string): Promise<{ accessLevel: string }> {
    const link = await this.guardianLinkRepo.findActiveLink(personId, studentId);
    if (!link || link.accessLevel === 'NO_FINANCE') {
      throw new ForbiddenException(PARENT_ERRORS.NOT_LINKED_TO_STUDENT);
    }
    return link;
  }

  private async assertCanPay(personId: string, studentId: string): Promise<void> {
    const link = await this.assertCanView(personId, studentId);
    if (link.accessLevel !== 'FULL') {
      throw new ForbiddenException(PARENT_ERRORS.VIEW_ONLY_ACCESS);
    }
  }

  async listChildren(actor: AuthenticatedUser) {
    return this.guardianLinkRepo.listChildren(actor.personId);
  }

  async listTerms(actor: AuthenticatedUser, studentId: string) {
    await this.assertCanView(actor.personId, studentId);
    const terms = await this.parentFeeRepo.listTerms(studentId);
    return terms.map((t) => ({ ...t, label: `Term ${t.instalmentNo} · ${t.academicYearName}` }));
  }

  async getFeeSummary(actor: AuthenticatedUser, studentId: string, academicYearId: string, instalmentNo: number) {
    const link = await this.assertCanView(actor.personId, studentId);
    const lines = await this.parentFeeRepo.listLinesForTerm(studentId, academicYearId, instalmentNo);

    let totalPayable = 0n;
    let paid = 0n;
    for (const line of lines) {
      totalPayable += BigInt(line.amountPaise) + BigInt(line.lateFeePaise);
      paid += BigInt(line.paidPaise);
    }

    return {
      canPay: link.accessLevel === 'FULL',
      totalPayablePaise: totalPayable.toString(),
      paidPaise: paid.toString(),
      outstandingPaise: (totalPayable - paid).toString(),
      lines: lines.map((l) => ({
        feeDemandId: l.id,
        feeHeadName: l.feeHeadName ?? 'Fee',
        amountPaise: l.amountPaise,
        lateFeePaise: l.lateFeePaise,
        paidPaise: l.paidPaise,
        outstandingPaise: (BigInt(l.amountPaise) + BigInt(l.lateFeePaise) - BigInt(l.paidPaise)).toString(),
        dueDate: l.dueDate,
        state: l.state,
      })),
    };
  }

  async listPayments(actor: AuthenticatedUser, studentId: string) {
    await this.assertCanView(actor.personId, studentId);
    return this.paymentsService.listForStudent(studentId);
  }

  async getReceipt(actor: AuthenticatedUser, receiptId: string) {
    const detail = await this.paymentsService.getReceiptDetail(receiptId);
    if (!detail.student) throw new NotFoundException('Receipt not found');
    await this.assertCanView(actor.personId, detail.student.id);
    return detail;
  }

  /** Validates the request against real, current balances, opens a real Razorpay
   * order, and records a local INITIATED payment intent naming exactly which
   * fee_demand lines (and how much of each) this order is for — nothing is applied
   * to any obligation yet; only handleRazorpayWebhook does that, once Razorpay
   * itself confirms the money actually arrived. */
  async createRazorpayOrder(actor: AuthenticatedUser, studentId: string, dto: CreateRazorpayOrderDto) {
    await this.assertCanPay(actor.personId, studentId);

    const lines = await this.parentFeeRepo.findManyForStudent(studentId, dto.feeDemandIds);
    if (lines.length !== dto.feeDemandIds.length) {
      throw new NotFoundException(PARENT_ERRORS.FEE_LINES_NOT_FOUND);
    }
    if (lines.some((l) => !PAYABLE_STATES.includes(l.state))) {
      throw new ConflictException(PARENT_ERRORS.FEE_LINE_NOT_PAYABLE);
    }

    const outstanding = lines.reduce(
      (sum, l) => sum + BigInt(l.amountPaise) + BigInt(l.lateFeePaise) - BigInt(l.paidPaise),
      0n,
    );
    const amount = BigInt(dto.amountPaise);
    if (amount > outstanding) {
      throw new ConflictException(PARENT_ERRORS.AMOUNT_EXCEEDS_OUTSTANDING);
    }

    const allocations = splitAllocation(lines, dto.feeDemandIds, dto.amountPaise);

    // Gateway-mediated modes require a mode at intent-creation time even though
    // Razorpay's own checkout is what actually lets the payer choose UPI/Card/Net
    // banking — UPI is the honest, most common default; markConfirmedFromWebhook
    // corrects it to whatever Razorpay reports once the payment actually completes.
    const payment = await this.paymentsService.create(
      {
        amountPaise: dto.amountPaise,
        mode: 'UPI',
        paidByPersonId: actor.personId,
        idempotencyKey: crypto.randomUUID(),
        gateway: 'RAZORPAY',
      },
      actor,
    );

    const school = await this.schoolProfileRepo.get();
    const order = await this.razorpayService.createOrder({
      amountPaise: dto.amountPaise,
      receipt: payment.id,
      notes: { studentId, academicYearId: dto.academicYearId, instalmentNo: String(dto.instalmentNo) },
    });

    await this.gatewayOrderRepo.create({
      paymentId: payment.id,
      studentId,
      gateway: 'RAZORPAY',
      gatewayOrderId: order.id,
      allocations,
      createdBy: actor.personId,
    });

    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'PARENT',
      action: 'PARENT_FEE_PAYMENT_INITIATED',
      objectType: 'payment',
      objectId: payment.id,
      outcome: 'SUCCESS',
      afterData: { studentId, allocations, amountPaise: dto.amountPaise },
    });

    return {
      paymentId: payment.id,
      razorpayOrderId: order.id,
      razorpayKeyId: this.razorpayService.keyId,
      amountPaise: dto.amountPaise,
      schoolName: school?.name ?? 'School EOS',
    };
  }

  /** Razorpay's own webhook — verified by RazorpayWebhookGuard before this ever
   * runs. Only two event types are actually acted on; everything else is
   * acknowledged and ignored, per Razorpay's own contract (a 200 for any event this
   * handler doesn't care about, so it isn't retried). */
  async handleRazorpayWebhook(body: any): Promise<{ acknowledged: true }> {
    const event = body?.event;
    if (event !== 'payment.captured' && event !== 'payment.failed') {
      return { acknowledged: true };
    }

    const entity = body?.payload?.payment?.entity;
    if (!entity?.order_id || !entity?.id) {
      return { acknowledged: true };
    }

    const gatewayOrder = await this.gatewayOrderRepo.findByGatewayOrderId('RAZORPAY', entity.order_id);
    if (!gatewayOrder) {
      // Unknown order — acknowledge rather than reject, same "surfaces later in
      // reconciliation" philosophy as Finance's own generic webhook handler.
      return { acknowledged: true };
    }

    const payment = await this.paymentRepo.findById(gatewayOrder.paymentId);
    if (!payment) {
      return { acknowledged: true };
    }

    const status = event === 'payment.captured' ? 'CONFIRMED' : 'FAILED';
    const result = await this.paymentsService.handleWebhookEvent({
      eventId: `${entity.id}:${event}`,
      gateway: 'RAZORPAY',
      gatewayRef: entity.id,
      paymentReference: payment.idempotencyKey,
      amountPaise: String(entity.amount),
      status,
      mode: mapRazorpayMethod(entity.method) ?? undefined,
    });

    if (status === 'CONFIRMED' && result.matched) {
      try {
        await this.paymentsService.allocate(gatewayOrder.paymentId, gatewayOrder.allocations);
      } catch (err) {
        // A genuine race against another payment against the same fee_demand in the
        // few seconds between order-creation validation and this webhook arriving
        // is the only realistic way this throws — the payment is still correctly
        // CONFIRMED and visible to Finance, who can allocate it manually from the
        // existing Payments screen. Acknowledge regardless: retrying this webhook
        // would hit the exact same conflict every time.
        await this.audit.record({
          actorPersonId: null,
          actorRoleCode: null,
          action: 'PARENT_FEE_PAYMENT_ALLOCATION_FAILED',
          objectType: 'payment',
          objectId: gatewayOrder.paymentId,
          outcome: 'ERROR',
          afterData: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    return { acknowledged: true };
  }
}
