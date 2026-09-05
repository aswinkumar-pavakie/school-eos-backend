// 2.8 Expense. Real DB state machine (expense_state_check): RECORDED -> PENDING_APPROVAL
// -> APPROVED/REJECTED -> PAID. There is no CANCELLED state for expense (unlike
// concession/fee_demand) — delete is the only way to remove a not-yet-submitted one.
//
// Already-configured approval_policy data (request_type 'EXPENSE_ABOVE_PETTY',
// approver PRINCIPAL, unconditional single final step) means this does NOT stay fully
// self-contained the way the original feature prose suggested — an expense at or below
// its category's petty_limit_paise is Finance's own authority to record and
// immediately clear; above that limit, submit() routes through the generic approvals
// engine exactly like refunds and fee-structure activation do.

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { FINANCE_ERRORS } from '../../../common/errors/error-codes';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { ApprovalsService } from '../../approvals/approvals.service';
import { ExpenseCategoryRepository } from '../master-data/repositories/expense-category.repository';
import { ExpenseRepository, ExpenseRow } from './repositories/expense.repository';

const EDITABLE_STATES = ['RECORDED'];
const DELETABLE_STATES = ['RECORDED'];

@Injectable()
export class ExpensesService {
  constructor(
    private readonly repo: ExpenseRepository,
    private readonly categoryRepo: ExpenseCategoryRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(filter: { state?: string; categoryId?: string }, page: PageQuery) {
    return this.repo.list(filter, page);
  }

  async getById(id: string): Promise<ExpenseRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException(FINANCE_ERRORS.EXPENSE_NOT_FOUND);
    return row;
  }

  async create(
    input: {
      categoryId: string;
      amountPaise: string;
      incurredOn: string;
      vendorName?: string;
      description?: string;
      billObjectKey?: string;
    },
    actor: AuthenticatedUser,
  ): Promise<ExpenseRow> {
    return this.repo.create({ ...input, recordedBy: actor.personId });
  }

  async update(
    id: string,
    input: { amountPaise?: string; incurredOn?: string; vendorName?: string; description?: string; billObjectKey?: string },
  ): Promise<ExpenseRow> {
    return this.unitOfWork.run(async (client) => {
      const expense = await this.repo.findByIdForUpdate(id, client);
      if (!expense) throw new NotFoundException(FINANCE_ERRORS.EXPENSE_NOT_FOUND);
      if (!EDITABLE_STATES.includes(expense.state)) {
        throw new ConflictException(FINANCE_ERRORS.EXPENSE_WRONG_STATE);
      }
      await this.repo.update(id, input, client);
      return (await this.repo.findById(id, client))!;
    });
  }

  async delete(id: string, actor: AuthenticatedUser): Promise<void> {
    return this.unitOfWork.run(async (client) => {
      const expense = await this.repo.findByIdForUpdate(id, client);
      if (!expense) throw new NotFoundException(FINANCE_ERRORS.EXPENSE_NOT_FOUND);
      if (!DELETABLE_STATES.includes(expense.state)) {
        throw new ConflictException('Only a not-yet-submitted expense can be deleted');
      }
      if (expense.recordedBy !== actor.personId) {
        throw new ForbiddenException('You can only delete an expense you recorded yourself');
      }
      await this.repo.delete(id, client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'EXPENSE_DELETED',
          objectType: 'expense',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: expense,
        },
        client,
      );
    });
  }

  /**
   * Submit locks the expense from further edits. At/below the category's petty-cash
   * limit, Finance's own act of recording+submitting is sufficient authority — it
   * clears immediately (RECORDED -> APPROVED). Above the limit, this creates an
   * EXPENSE_ABOVE_PETTY approval request (approver PRINCIPAL); the expense moves to
   * PENDING_APPROVAL until the approvals engine decides it (see
   * FinanceApprovalHandlers' 'expense' handler).
   */
  async submit(id: string, actor: AuthenticatedUser): Promise<ExpenseRow> {
    return this.unitOfWork.run(async (client) => {
      const expense = await this.repo.findByIdForUpdate(id, client);
      if (!expense) throw new NotFoundException(FINANCE_ERRORS.EXPENSE_NOT_FOUND);
      if (expense.state !== 'RECORDED') {
        throw new ConflictException(FINANCE_ERRORS.EXPENSE_WRONG_STATE);
      }

      const category = await this.categoryRepo.findById(expense.categoryId, client);
      const pettyLimit = BigInt(category?.pettyLimitPaise ?? '0');
      const amount = BigInt(expense.amountPaise);

      if (amount <= pettyLimit) {
        await this.repo.setState(id, 'APPROVED', client);
        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'FINANCE',
            action: 'EXPENSE_AUTO_APPROVED_PETTY',
            objectType: 'expense',
            objectId: id,
            outcome: 'SUCCESS',
          },
          client,
        );
        return { ...expense, state: 'APPROVED' };
      }

      await this.repo.setState(id, 'PENDING_APPROVAL', client);
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'EXPENSE_ABOVE_PETTY',
          subjectObjectType: 'expense',
          subjectObjectId: id,
          requestedBy: actor.personId,
          amountPaise: expense.amountPaise,
          payload: { categoryId: expense.categoryId, description: expense.description },
        },
        client,
      );
      await this.repo.linkApprovalRequest(id, approvalRequest.id, client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'EXPENSE_SUBMITTED_FOR_APPROVAL',
          objectType: 'expense',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { approvalRequestId: approvalRequest.id },
        },
        client,
      );
      return { ...expense, state: 'PENDING_APPROVAL', approvalRequestId: approvalRequest.id };
    });
  }

  /** APPROVED -> PAID: Finance confirms the vendor/reimbursement has actually been paid out. */
  async pay(id: string, actor: AuthenticatedUser): Promise<ExpenseRow> {
    return this.unitOfWork.run(async (client) => {
      const expense = await this.repo.findByIdForUpdate(id, client);
      if (!expense) throw new NotFoundException(FINANCE_ERRORS.EXPENSE_NOT_FOUND);
      if (expense.state !== 'APPROVED') {
        throw new ConflictException('Only an APPROVED expense can be marked as paid');
      }
      await this.repo.setState(id, 'PAID', client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'EXPENSE_PAID',
          objectType: 'expense',
          objectId: id,
          outcome: 'SUCCESS',
        },
        client,
      );
      return { ...expense, state: 'PAID' };
    });
  }
}
