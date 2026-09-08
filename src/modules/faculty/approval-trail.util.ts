// Shared "who approved/rejected this, and at which step" trail -- every
// Faculty request that goes through the generic approvals engine (HR
// Payroll, Payslip, Appraisal, Employee Leave & OD) attaches this the same
// way, reading ApprovalStepRepository directly (real decidedByName already
// joined in there) rather than going through ApprovalsService.getById's own
// separate requester-or-approver authorization check -- these callers have
// already verified ownership themselves (staffId = caller's own).

import { ApprovalStepRepository } from '../approvals/repositories/approval-step.repository';

export interface ApprovalStepSummary {
  sequenceNo: number;
  approverRoleCode: string;
  decision: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  comment: string | null;
}

export async function getApprovalTrail(
  stepRepo: ApprovalStepRepository,
  approvalRequestId: string | null,
): Promise<ApprovalStepSummary[]> {
  if (!approvalRequestId) return [];
  const steps = await stepRepo.listByRequest(approvalRequestId);
  return steps.map((s) => ({
    sequenceNo: s.sequenceNo,
    approverRoleCode: s.approverRoleCode,
    decision: s.decision,
    decidedByName: s.decidedByName,
    decidedAt: s.decidedAt,
    comment: s.comment,
  }));
}
