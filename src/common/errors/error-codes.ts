// Auth-module error message constants — kept literal and centralized so the exact
// contract strings (relied on by every frontend track) can't drift between call sites.

export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_LOCKED: 'Account temporarily locked. Try again later.',
  ACCOUNT_DEACTIVATED: 'This account has been deactivated. Contact school office.',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
  RESET_ALREADY_USED: 'Self-service reset already used. Contact school office.',
  INVALID_OTP: 'Invalid or expired OTP',
} as const;

export const APPROVALS_ERRORS = {
  REQUEST_NOT_FOUND: 'Approval request not found',
  NOT_PENDING: 'This approval request has already been decided',
  STEP_NOT_ASSIGNED_TO_CALLER: 'The current step of this request is not assigned to your role',
  NO_POLICY_FOR_REQUEST_TYPE: 'No approval policy is configured for this request type',
  UNSUPPORTED_SUBJECT_TYPE: 'No state-transition handler is registered for this subject type',
} as const;

export const FINANCE_ERRORS = {
  FEE_STRUCTURE_NOT_FOUND: 'Fee structure not found',
  FEE_STRUCTURE_LOCKED: 'Fee structure can only be updated before activation',
  FEE_STRUCTURE_ALREADY_ACTIVE: 'Fee structure is already active',
  FEE_DEMAND_NOT_FOUND: 'Financial obligation not found',
  IMPORT_JOB_NOT_FOUND: 'Import job not found',
  IMPORT_JOB_WRONG_STATE: 'Import job is not in the required state for this action',
  PAYMENT_NOT_FOUND: 'Payment not found',
  PAYMENT_NOT_CONFIRMED: 'Payment has not been confirmed',
  ALLOCATION_EXCEEDS_PAYMENT: 'Allocation total cannot exceed the payment amount',
  ALLOCATION_EXCEEDS_DEMAND: 'Allocation cannot exceed the obligation balance',
  RECEIPT_NOT_FOUND: 'Receipt not found',
  REFUND_NOT_FOUND: 'Refund not found',
  REFUND_SELF_APPROVAL: 'Finance cannot approve its own refund request',
  EXPENSE_NOT_FOUND: 'Expense not found',
  EXPENSE_WRONG_STATE: 'Expense is not in the required state for this action',
  RECONCILIATION_NOT_FOUND: 'Reconciliation not found',
  RECONCILIATION_WRONG_STATE: 'Reconciliation is not in the required state for this action',
  INVALID_WEBHOOK_SIGNATURE: 'Invalid payment webhook signature',
} as const;

export const PARENT_ERRORS = {
  NOT_LINKED_TO_STUDENT: 'You are not linked to this student',
  VIEW_ONLY_ACCESS: 'Your access to this student is view-only — payments must be made by the primary guardian',
  FEE_LINES_NOT_FOUND: 'One or more selected fees could not be found for this student',
  FEE_LINE_NOT_PAYABLE: 'One or more selected fees are not open for payment',
  AMOUNT_EXCEEDS_OUTSTANDING: 'The amount entered is more than what is actually outstanding on the selected fees',
} as const;
