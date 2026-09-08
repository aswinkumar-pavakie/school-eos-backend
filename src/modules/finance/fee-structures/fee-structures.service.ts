// 2.1 Fee Structure — list/create/update/activate/deactivate/delete.
//
// Real DB state machine (fee_structure_state_check): DRAFT -> PENDING_APPROVAL ->
// ACTIVE -> SUPERSEDED, with REJECTED activation reverting PENDING_APPROVAL back to
// DRAFT. "Update is only permitted before activation" is enforced by the plain
// `state !== 'DRAFT'` check below — once a structure leaves DRAFT (submitted,
// active, or superseded) it can never be edited again, only deleted while still DRAFT.
// Real, already-configured approval_policy data (request_type 'FEE_STRUCTURE',
// approver PRINCIPAL) means activation is NOT a direct Finance-side flip: it creates
// an approval request, and only the approvals engine's 'fee_structure' handler (see
// finance-approval-handlers.service.ts) moves it to ACTIVE/back to DRAFT once
// Principal decides.

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { FINANCE_ERRORS } from '../../../common/errors/error-codes';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { ApprovalsService } from '../../approvals/approvals.service';
import {
  FeeStructureLineInput,
  FeeStructureRepository,
  FeeStructureRow,
} from './repositories/fee-structure.repository';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

function sumLines(lines: FeeStructureLineInput[]): string {
  return lines.reduce((sum, l) => sum + BigInt(l.amountPaise), 0n).toString();
}

@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly repo: FeeStructureRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(
    filter: { academicYearId?: string; gradeId?: string; state?: string },
    page: PageQuery,
  ) {
    const { rows, total } = await this.repo.list(filter, page);
    return { rows, total };
  }

  async getById(id: string): Promise<{
    structure: FeeStructureRow;
    lines: Awaited<ReturnType<FeeStructureRepository['listLines']>>;
  }> {
    const structure = await this.repo.findById(id);
    if (!structure)
      throw new NotFoundException(FINANCE_ERRORS.FEE_STRUCTURE_NOT_FOUND);
    const lines = await this.repo.listLines(id);
    return { structure, lines };
  }

  async create(input: {
    academicYearId: string;
    gradeId: string;
    mediumId?: string;
    category?: string;
    lines: FeeStructureLineInput[];
  }): Promise<FeeStructureRow> {
    try {
      return await this.unitOfWork.run(async (client) => {
        const structure = await this.repo.create(
          {
            academicYearId: input.academicYearId,
            gradeId: input.gradeId,
            mediumId: input.mediumId ?? null,
            category: input.category ?? null,
            totalPaise: sumLines(input.lines),
          },
          client,
        );
        await this.repo.replaceLines(structure.id, input.lines, client);
        return structure;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A fee structure already exists for this academic year, grade, medium and category',
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    input: { category?: string; lines?: FeeStructureLineInput[] },
  ): Promise<FeeStructureRow> {
    return this.unitOfWork.run(async (client) => {
      const structure = await this.repo.findByIdForUpdate(id, client);
      if (!structure)
        throw new NotFoundException(FINANCE_ERRORS.FEE_STRUCTURE_NOT_FOUND);
      if (structure.state !== 'DRAFT') {
        throw new ConflictException(FINANCE_ERRORS.FEE_STRUCTURE_LOCKED);
      }

      const category = input.category ?? structure.category;
      let totalPaise = structure.totalPaise;
      if (input.lines) {
        await this.repo.replaceLines(id, input.lines, client);
        totalPaise = sumLines(input.lines);
      }
      await this.repo.updateCategoryAndTotal(id, category, totalPaise, client);
      return { ...structure, category, totalPaise };
    });
  }

  async delete(id: string): Promise<void> {
    return this.unitOfWork.run(async (client) => {
      const structure = await this.repo.findByIdForUpdate(id, client);
      if (!structure)
        throw new NotFoundException(FINANCE_ERRORS.FEE_STRUCTURE_NOT_FOUND);
      if (structure.state !== 'DRAFT') {
        throw new ConflictException(
          'Only a draft, never-activated fee structure can be deleted',
        );
      }
      await this.repo.delete(id, client);
    });
  }

  /** Submits the structure for Principal's activation approval — does not activate it directly. */
  async activate(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<FeeStructureRow> {
    return this.unitOfWork.run(async (client) => {
      const structure = await this.repo.findByIdForUpdate(id, client);
      if (!structure)
        throw new NotFoundException(FINANCE_ERRORS.FEE_STRUCTURE_NOT_FOUND);
      if (structure.state !== 'DRAFT') {
        throw new ConflictException(
          structure.state === 'ACTIVE'
            ? FINANCE_ERRORS.FEE_STRUCTURE_ALREADY_ACTIVE
            : FINANCE_ERRORS.FEE_STRUCTURE_LOCKED,
        );
      }

      const approvalRequest = await this.approvalsService.createRequest(
        {
          requestType: 'FEE_STRUCTURE',
          subjectObjectType: 'fee_structure',
          subjectObjectId: id,
          requestedBy: actor.personId,
          amountPaise: structure.totalPaise,
        },
        client,
      );
      await this.repo.linkApprovalRequest(id, approvalRequest.id, client);
      await this.repo.setState(id, 'PENDING_APPROVAL', client);
      return {
        ...structure,
        state: 'PENDING_APPROVAL',
        approvalRequestId: approvalRequest.id,
      };
    });
  }

  /** ACTIVE -> SUPERSEDED only — a structure that never activated has nothing to supersede. */
  async deactivate(id: string): Promise<FeeStructureRow> {
    return this.unitOfWork.run(async (client) => {
      const structure = await this.repo.findByIdForUpdate(id, client);
      if (!structure)
        throw new NotFoundException(FINANCE_ERRORS.FEE_STRUCTURE_NOT_FOUND);
      if (structure.state !== 'ACTIVE') {
        throw new ConflictException(
          'Only an ACTIVE fee structure can be superseded',
        );
      }
      await this.repo.setState(id, 'SUPERSEDED', client);
      return { ...structure, state: 'SUPERSEDED' };
    });
  }
}
