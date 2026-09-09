// Concession — not in the original 2.1-2.9 numbered breakdown, but confirmed as a real,
// required Finance feature by already-configured approval_policy data (request_type
// 'FEE_CONCESSION': FINANCE step 1, PRINCIPAL step 2 final, both unconditional — no
// amount threshold/bypass, unlike Refund). Every concession routes through the
// approvals engine; there is no Finance-direct-processing path here.

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { ApprovalsService } from '../../approvals/approvals.service';
import {
  ConcessionRepository,
  ConcessionRow,
} from './repositories/concession.repository';

const OPEN_APPROVAL_STATES = ['PENDING', 'RETROSPECTIVE_PENDING'];

@Injectable()
export class ConcessionsService {
  constructor(
    private readonly repo: ConcessionRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(
    filter: { studentId?: string; state?: string; studentSearch?: string },
    page: PageQuery,
  ) {
    return this.repo.list(filter, page);
  }

  async getById(id: string): Promise<ConcessionRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Concession not found');
    return row;
  }

  async create(
    input: {
      studentId: string;
      academicYearId: string;
      concessionType: string;
      amountPaise?: string;
      percent?: string;
      reason: string;
    },
    actor: AuthenticatedUser,
  ): Promise<ConcessionRow> {
    // concession_amount_or_pct is a DB-level XOR constraint — enforced here too, for a
    // clean 409 instead of a raw constraint-violation 500.
    if (Boolean(input.amountPaise) === Boolean(input.percent)) {
      throw new ConflictException(
        'Provide exactly one of amountPaise or percent, not both or neither',
      );
    }
    return this.unitOfWork.run(async (client) => {
      const concession = await this.repo.create(
        {
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          concessionType: input.concessionType,
          amountPaise: input.amountPaise ?? null,
          percent: input.percent ?? null,
          reason: input.reason,
        },
        client,
      );
      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'FEE_CONCESSION',
          subjectObjectType: 'concession',
          subjectObjectId: concession.id,
          requestedBy: actor.personId,
          amountPaise: input.amountPaise,
          payload: { reason: input.reason, studentId: input.studentId },
        },
        client,
      );
      await this.repo.linkApprovalRequest(
        concession.id,
        approvalRequest.id,
        client,
      );
      return { ...concession, approvalRequestId: approvalRequest.id };
    });
  }

  private async assertStillOpen(concession: ConcessionRow): Promise<void> {
    if (concession.state !== 'PENDING') {
      throw new ConflictException('This concession has already been decided');
    }
    if (concession.approvalRequestId) {
      const state = await this.approvalsService.getState(
        concession.approvalRequestId,
      );
      if (state && !OPEN_APPROVAL_STATES.includes(state)) {
        throw new ConflictException('This concession has already been decided');
      }
    }
  }

  async update(
    id: string,
    input: { amountPaise?: string; percent?: string; reason?: string },
  ): Promise<ConcessionRow> {
    return this.unitOfWork.run(async (client) => {
      const concession = await this.repo.findByIdForUpdate(id, client);
      if (!concession) throw new NotFoundException('Concession not found');
      await this.assertStillOpen(concession);
      await this.repo.update(id, input, client);
      return (await this.repo.findById(id, client))!;
    });
  }

  /** Soft-cancel (state = 'CANCELLED') rather than a hard delete — concession_state_check
   * includes CANCELLED as a real terminal state, so a withdrawn request stays in the
   * audit trail instead of disappearing. */
  async delete(id: string): Promise<void> {
    return this.unitOfWork.run(async (client) => {
      const concession = await this.repo.findByIdForUpdate(id, client);
      if (!concession) throw new NotFoundException('Concession not found');
      await this.assertStillOpen(concession);
      await this.repo.setState(id, 'CANCELLED', client);
    });
  }
}
