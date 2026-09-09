import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { PageQuery } from '../../../common/pagination/pagination.util';
import {
  PaymentListRow,
  PaymentRow,
} from '../payments/repositories/payment.repository';
import { ReceiptRow } from '../payments/repositories/receipt.repository';
import { PaymentsService } from '../payments/payments.service';
import {
  DueStatus,
  StudentLedgerRow,
  StudentLookupRepository,
} from './repositories/student-lookup.repository';

@Injectable()
export class StudentsService {
  constructor(
    private readonly repo: StudentLookupRepository,
    private readonly paymentsService: PaymentsService,
  ) {}

  async list(
    filter: { search?: string; gradeId?: string; dueStatus?: DueStatus },
    page: PageQuery,
  ) {
    return this.repo.list(filter, page);
  }

  async getById(id: string): Promise<StudentLedgerRow> {
    const row = await this.repo.getById(id);
    if (!row) throw new NotFoundException('Student not found');
    return row;
  }

  async listPayments(studentId: string): Promise<PaymentListRow[]> {
    return this.paymentsService.listForStudent(studentId);
  }

  async listEducationLoanDDs(studentId: string): Promise<PaymentListRow[]> {
    return this.paymentsService.listForStudent(studentId, { mode: 'DD' });
  }

  async receivePayment(
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
    return this.paymentsService.receiveStudentPayment(studentId, input, actor);
  }
}
