// 2.3 Bulk Import Job. Validate never writes fee_demand; Confirm only proceeds from
// VALIDATED and re-validates before committing, since state (e.g. an assignment being
// deactivated) could have changed between the two calls. The client resubmits the same
// row set to both validate and confirm — there is no object-storage/file-parsing
// service in this codebase yet to read rows back from `sourceObjectKey` (see the
// Finance README's assumptions section).

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FINANCE_ERRORS } from '../../../common/errors/error-codes';
import { PageQuery } from '../../../common/pagination/pagination.util';
import { UnitOfWork } from '../../../common/transactions/unit-of-work';
import { FeeDemandRepository } from '../obligations/repositories/fee-demand.repository';
import { ImportRowDto } from './dto/import-rows.dto';
import { BulkImportJobRepository, BulkImportJobRow } from './repositories/bulk-import-job.repository';
import { StudentFeeAssignmentLookupRepository } from './repositories/student-fee-assignment-lookup.repository';

export interface RowError {
  index: number;
  message: string;
}

@Injectable()
export class ObligationImportsService {
  constructor(
    private readonly jobRepo: BulkImportJobRepository,
    private readonly feeDemandRepo: FeeDemandRepository,
    private readonly assignmentLookup: StudentFeeAssignmentLookupRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(filter: { state?: string }, page: PageQuery) {
    return this.jobRepo.list(filter, page);
  }

  async getById(id: string): Promise<BulkImportJobRow> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException(FINANCE_ERRORS.IMPORT_JOB_NOT_FOUND);
    return job;
  }

  async create(input: { fileName: string; sourceObjectKey: string; jobType?: string; createdBy: string }) {
    return this.jobRepo.create({
      fileName: input.fileName,
      sourceObjectKey: input.sourceObjectKey,
      jobType: input.jobType ?? 'FEE_OBLIGATION',
      createdBy: input.createdBy,
    });
  }

  private async validateRows(rows: ImportRowDto[]): Promise<RowError[]> {
    const errors: RowError[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = `${row.assignmentId}:${row.feeHeadId ?? ''}:${row.instalmentNo}`;
      if (seen.has(key)) {
        errors.push({ index: i, message: 'Duplicate row for the same assignment/fee head/instalment' });
        continue;
      }
      seen.add(key);

      if (BigInt(row.amountPaise) <= 0n) {
        errors.push({ index: i, message: 'amountPaise must be greater than zero' });
        continue;
      }
      const assignmentOk = await this.assignmentLookup.exists(row.assignmentId, row.studentId);
      if (!assignmentOk) {
        errors.push({ index: i, message: 'No matching student_fee_assignment for this student' });
      }
    }
    return errors;
  }

  async validate(id: string, rows: ImportRowDto[]): Promise<BulkImportJobRow> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException(FINANCE_ERRORS.IMPORT_JOB_NOT_FOUND);
    if (!['DRAFT', 'VALIDATED', 'VALIDATION_FAILED'].includes(job.state)) {
      throw new ConflictException(FINANCE_ERRORS.IMPORT_JOB_WRONG_STATE);
    }

    const errors = await this.validateRows(rows);
    const state = errors.length === 0 ? 'VALIDATED' : 'VALIDATION_FAILED';
    await this.unitOfWork.run((client) =>
      this.jobRepo.recordValidation(
        id,
        {
          totalRows: rows.length,
          validRows: rows.length - errors.length,
          errorRows: errors.length,
          rowErrors: errors,
          state,
        },
        client,
      ),
    );
    return (await this.jobRepo.findById(id))!;
  }

  async confirm(id: string, rows: ImportRowDto[]): Promise<BulkImportJobRow> {
    return this.unitOfWork.run(async (client) => {
      const job = await this.jobRepo.findByIdForUpdate(id, client);
      if (!job) throw new NotFoundException(FINANCE_ERRORS.IMPORT_JOB_NOT_FOUND);
      if (job.state !== 'VALIDATED') {
        throw new ConflictException(FINANCE_ERRORS.IMPORT_JOB_WRONG_STATE);
      }

      const errors = await this.validateRows(rows);
      if (errors.length > 0) {
        await this.jobRepo.recordValidation(
          id,
          { totalRows: rows.length, validRows: rows.length - errors.length, errorRows: errors.length, rowErrors: errors, state: 'VALIDATION_FAILED' },
          client,
        );
        throw new ConflictException('Rows changed since validation — re-validate before confirming');
      }

      for (const row of rows) {
        await this.feeDemandRepo.createFromImport(
          {
            assignmentId: row.assignmentId,
            studentId: row.studentId,
            feeHeadId: row.feeHeadId ?? null,
            instalmentNo: row.instalmentNo,
            amountPaise: row.amountPaise,
            lateFeePaise: row.lateFeePaise ?? '0',
            dueDate: row.dueDate,
            bulkImportJobId: id,
          },
          client,
        );
      }

      await this.jobRepo.markCommitted(id, client);
      return (await this.jobRepo.findById(id, client))!;
    });
  }

  async cancel(id: string): Promise<BulkImportJobRow> {
    return this.unitOfWork.run(async (client) => {
      const job = await this.jobRepo.findByIdForUpdate(id, client);
      if (!job) throw new NotFoundException(FINANCE_ERRORS.IMPORT_JOB_NOT_FOUND);
      if (!['DRAFT', 'VALIDATED', 'VALIDATION_FAILED'].includes(job.state)) {
        throw new ConflictException(FINANCE_ERRORS.IMPORT_JOB_WRONG_STATE);
      }
      await this.jobRepo.markCancelled(id, client);
      return (await this.jobRepo.findById(id, client))!;
    });
  }
}
