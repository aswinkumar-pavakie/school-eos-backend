// 2.2 Financial Obligation. Automatic generation ("the moment a student's enrolment
// activates against a live Fee Structure") belongs to the Enrolment/Academics feature,
// which doesn't exist yet in this codebase — this service only covers the manual-create
// path Finance uses for genuine one-offs (a late admission fee, a specific fine), plus
// list/get/delete/waive.
//
// Real DB state machine (fee_demand_state_check): PENDING, PARTIAL, PAID, WAIVED,
// OVERDUE, CANCELLED. OVERDUE is presumably flipped by a scheduled job comparing
// due_date (out of scope here, no scheduler exists in this codebase yet); this service
// covers every state reachable by a direct Finance action.

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { FINANCE_ERRORS } from '../../../common/errors/error-codes';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { FeeDemandRepository, FeeDemandRow } from './repositories/fee-demand.repository';

const WAIVABLE_STATES = ['PENDING', 'PARTIAL', 'OVERDUE'];

@Injectable()
export class ObligationsService {
  constructor(
    private readonly repo: FeeDemandRepository,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(filter: { studentId?: string; state?: string }, page: PageQuery) {
    return this.repo.list(filter, page);
  }

  async getById(id: string): Promise<FeeDemandRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException(FINANCE_ERRORS.FEE_DEMAND_NOT_FOUND);
    return row;
  }

  async create(input: {
    assignmentId: string;
    studentId: string;
    feeHeadId?: string;
    instalmentNo: number;
    amountPaise: string;
    lateFeePaise?: string;
    dueDate: string;
  }): Promise<FeeDemandRow> {
    return this.repo.create({
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      feeHeadId: input.feeHeadId ?? null,
      instalmentNo: input.instalmentNo,
      amountPaise: input.amountPaise,
      lateFeePaise: input.lateFeePaise ?? '0',
      dueDate: input.dueDate,
    });
  }

  /** Soft-cancel (state = 'CANCELLED') rather than a hard delete — only ever for a
   * never-paid, still-PENDING obligation; anything with payment history is permanent
   * and stays visible in the ledger regardless. */
  async delete(id: string): Promise<void> {
    return this.unitOfWork.run(async (client) => {
      const demand = await this.repo.findByIdForUpdate(id, client);
      if (!demand) throw new NotFoundException(FINANCE_ERRORS.FEE_DEMAND_NOT_FOUND);
      if (demand.state !== 'PENDING' || demand.paidPaise !== '0') {
        throw new ConflictException('Only a PENDING obligation with no payments recorded can be deleted');
      }
      await this.repo.setState(id, 'CANCELLED', client);
    });
  }

  /** Finance writes off the remaining balance (hardship, error correction, etc.) — the obligation is cleared without a payment. */
  async waive(id: string, actor: AuthenticatedUser, reason: string): Promise<FeeDemandRow> {
    return this.unitOfWork.run(async (client) => {
      const demand = await this.repo.findByIdForUpdate(id, client);
      if (!demand) throw new NotFoundException(FINANCE_ERRORS.FEE_DEMAND_NOT_FOUND);
      if (!WAIVABLE_STATES.includes(demand.state)) {
        throw new ConflictException('Only a PENDING, PARTIAL or OVERDUE obligation can be waived');
      }
      await this.repo.setState(id, 'WAIVED', client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'OBLIGATION_WAIVED',
          objectType: 'fee_demand',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { reason },
        },
        client,
      );
      return { ...demand, state: 'WAIVED' };
    });
  }
}
