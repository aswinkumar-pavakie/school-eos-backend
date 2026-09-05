// 2.9 Reconciliation — Finance's back-office cross-check between the gateway's own
// settlement report and what this system recorded as CONFIRMED. Run does the matching
// pass; Resolve is the manual step for whatever it couldn't match; Close locks the
// period only once nothing is left unmatched/unresolved.

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { FINANCE_ERRORS } from '../../../common/errors/error-codes';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { PaymentRepository } from '../payments/repositories/payment.repository';
import { ReconciliationRepository, ReconciliationRow } from './repositories/reconciliation.repository';

@Injectable()
export class ReconciliationsService {
  constructor(
    private readonly repo: ReconciliationRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(filter: { state?: string }, page: PageQuery) {
    return this.repo.list(filter, page);
  }

  async getById(id: string) {
    const reconciliation = await this.repo.findById(id);
    if (!reconciliation) throw new NotFoundException(FINANCE_ERRORS.RECONCILIATION_NOT_FOUND);
    const entries = await this.repo.listEntries(id);
    return { reconciliation, entries };
  }

  async create(
    input: { gateway: string; periodFrom: string; periodTo: string; settlementObjectKey?: string },
    actor: AuthenticatedUser,
  ): Promise<ReconciliationRow> {
    return this.repo.create({
      gateway: input.gateway,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      settlementObjectKey: input.settlementObjectKey ?? null,
      createdBy: actor.personId,
    });
  }

  async delete(id: string): Promise<void> {
    return this.unitOfWork.run(async (client) => {
      const reconciliation = await this.repo.findByIdForUpdate(id, client);
      if (!reconciliation) throw new NotFoundException(FINANCE_ERRORS.RECONCILIATION_NOT_FOUND);
      if (reconciliation.state !== 'DRAFT') {
        throw new ConflictException('Only a not-yet-run reconciliation can be deleted');
      }
      await this.repo.delete(id, client);
    });
  }

  async run(id: string, settlementRows: { gatewayRef: string; amountPaise: string }[]) {
    return this.unitOfWork.run(async (client) => {
      const reconciliation = await this.repo.findByIdForUpdate(id, client);
      if (!reconciliation) throw new NotFoundException(FINANCE_ERRORS.RECONCILIATION_NOT_FOUND);
      if (!['DRAFT', 'NEEDS_REVIEW'].includes(reconciliation.state)) {
        throw new ConflictException(FINANCE_ERRORS.RECONCILIATION_WRONG_STATE);
      }

      await this.repo.setState(id, 'RUNNING', client);

      for (const row of settlementRows) {
        const payment = await this.paymentRepo.findByGatewayRef(reconciliation.gateway, row.gatewayRef, client);
        if (!payment) {
          await this.repo.createEntry(
            {
              reconciliationId: id,
              paymentId: null,
              gatewayRef: row.gatewayRef,
              gatewayAmountPaise: row.amountPaise,
              matchState: 'UNMATCHED',
              discrepancyReason: null,
            },
            client,
          );
          continue;
        }
        if (payment.amountPaise !== row.amountPaise || payment.state !== 'CONFIRMED') {
          await this.repo.createEntry(
            {
              reconciliationId: id,
              paymentId: payment.id,
              gatewayRef: row.gatewayRef,
              gatewayAmountPaise: row.amountPaise,
              matchState: 'DISCREPANCY',
              discrepancyReason:
                payment.state !== 'CONFIRMED'
                  ? `Local payment state is ${payment.state}, not CONFIRMED`
                  : `Amount mismatch: local ${payment.amountPaise} vs settlement ${row.amountPaise}`,
            },
            client,
          );
          continue;
        }
        await this.repo.createEntry(
          {
            reconciliationId: id,
            paymentId: payment.id,
            gatewayRef: row.gatewayRef,
            gatewayAmountPaise: row.amountPaise,
            matchState: 'MATCHED',
            discrepancyReason: null,
          },
          client,
        );
        await this.paymentRepo.markReconciled(payment.id, client);
      }

      await this.repo.recomputeCounts(id, client);
      await this.repo.markRun(id, client);
      await this.repo.setState(id, 'NEEDS_REVIEW', client);

      return this.repo.findById(id, client);
    });
  }

  async resolve(
    id: string,
    input: { entryId: string; resolutionNote: string },
    actor: AuthenticatedUser,
  ) {
    return this.unitOfWork.run(async (client) => {
      const reconciliation = await this.repo.findByIdForUpdate(id, client);
      if (!reconciliation) throw new NotFoundException(FINANCE_ERRORS.RECONCILIATION_NOT_FOUND);
      if (reconciliation.state !== 'NEEDS_REVIEW') {
        throw new ConflictException(FINANCE_ERRORS.RECONCILIATION_WRONG_STATE);
      }
      const entry = await this.repo.findEntryByIdForUpdate(input.entryId, client);
      if (!entry || entry.reconciliationId !== id) {
        throw new NotFoundException('Reconciliation entry not found');
      }
      if (!['UNMATCHED', 'DISCREPANCY'].includes(entry.matchState)) {
        throw new ConflictException('Entry is not in a resolvable state');
      }

      await this.repo.resolveEntry(input.entryId, actor.personId, input.resolutionNote, client);
      await this.repo.recomputeCounts(id, client);
      await this.audit.record(
        {
          actorPersonId: actor.personId,
          actorRoleCode: 'FINANCE',
          action: 'RECONCILIATION_ENTRY_RESOLVED',
          objectType: 'reconciliation_entry',
          objectId: input.entryId,
          outcome: 'SUCCESS',
          afterData: { status: 'RESOLVED', resolutionNote: input.resolutionNote },
        },
        client,
      );

      return this.repo.findById(id, client);
    });
  }

  async close(id: string, actor: AuthenticatedUser): Promise<ReconciliationRow> {
    return this.unitOfWork.run(async (client) => {
      const reconciliation = await this.repo.findByIdForUpdate(id, client);
      if (!reconciliation) throw new NotFoundException(FINANCE_ERRORS.RECONCILIATION_NOT_FOUND);
      if (reconciliation.state !== 'NEEDS_REVIEW') {
        throw new ConflictException(FINANCE_ERRORS.RECONCILIATION_WRONG_STATE);
      }
      if (reconciliation.unmatchedCount > 0 || reconciliation.discrepancyCount > 0) {
        throw new ConflictException(
          'Every unmatched entry and discrepancy must be resolved before closing',
        );
      }
      await this.repo.markClosed(id, actor.personId, client);
      return (await this.repo.findById(id, client))!;
    });
  }
}
