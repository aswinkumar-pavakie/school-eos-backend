// Auth-module error message constants — kept literal and centralized so the exact
// contract strings (relied on by every frontend track) can't drift between call sites.

export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_LOCKED: 'Account temporarily locked. Try again later.',
  ACCOUNT_DEACTIVATED:
    'This account has been deactivated. Contact school office.',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
  RESET_ALREADY_USED: 'Self-service reset already used. Contact school office.',
  INVALID_OTP: 'Invalid or expired OTP',
} as const;

export const APPROVALS_ERRORS = {
  REQUEST_NOT_FOUND: 'Approval request not found',
  NOT_PENDING: 'This approval request has already been decided',
  STEP_NOT_ASSIGNED_TO_CALLER:
    'The current step of this request is not assigned to your role',
  NO_POLICY_FOR_REQUEST_TYPE:
    'No approval policy is configured for this request type',
  UNSUPPORTED_SUBJECT_TYPE:
    'No state-transition handler is registered for this subject type',
} as const;

export const FINANCE_ERRORS = {
  FEE_STRUCTURE_NOT_FOUND: 'Fee structure not found',
  FEE_STRUCTURE_LOCKED: 'Fee structure can only be updated before activation',
  FEE_STRUCTURE_ALREADY_ACTIVE: 'Fee structure is already active',
  FEE_DEMAND_NOT_FOUND: 'Financial obligation not found',
  IMPORT_JOB_NOT_FOUND: 'Import job not found',
  IMPORT_JOB_WRONG_STATE:
    'Import job is not in the required state for this action',
  PAYMENT_NOT_FOUND: 'Payment not found',
  PAYMENT_NOT_CONFIRMED: 'Payment has not been confirmed',
  ALLOCATION_EXCEEDS_PAYMENT:
    'Allocation total cannot exceed the payment amount',
  ALLOCATION_EXCEEDS_DEMAND: 'Allocation cannot exceed the obligation balance',
  RECEIPT_NOT_FOUND: 'Receipt not found',
  REFUND_NOT_FOUND: 'Refund not found',
  REFUND_SELF_APPROVAL: 'Finance cannot approve its own refund request',
  EXPENSE_NOT_FOUND: 'Expense not found',
  EXPENSE_WRONG_STATE: 'Expense is not in the required state for this action',
  RECONCILIATION_NOT_FOUND: 'Reconciliation not found',
  RECONCILIATION_WRONG_STATE:
    'Reconciliation is not in the required state for this action',
  INVALID_WEBHOOK_SIGNATURE: 'Invalid payment webhook signature',
} as const;

// Same message for "doesn't exist" and "isn't yours" (OFFERING_NOT_FOUND, NOT_FOUND) —
// deliberately indistinguishable, mirroring the HLD's 404-not-403 rule for out-of-scope
// objects (e.g. a parent gets 404, not 403, on another guardian's child).
export const ONLINE_CLASS_ERRORS = {
  NOT_FACULTY: 'Authenticated user is not an active faculty member',
  OFFERING_NOT_FOUND: 'Subject offering not found',
  NOT_FOUND: 'Online class not found',
  INVALID_TIME_RANGE: 'endTime must be after startTime',
  IN_PAST: 'Cannot schedule an online class in the past',
  OVERLAPPING_SCHEDULE:
    'You already have another online class scheduled in this time range',
  ALREADY_FINALIZED:
    'This online class has already been completed or cancelled',
  NOT_COMPLETED: 'Recording can only be added once the class is completed',
  IDEMPOTENCY_KEY_REQUIRED: 'Idempotency-Key header is required',
  NOT_SCHEDULED: 'Only a SCHEDULED class can be started',
  NOT_LIVE: 'Only a LIVE class can be marked completed',
  GOOGLE_EVENT_NOT_FOUND:
    'The Google Calendar event for this class could not be found — it may have been removed directly in Google Calendar',
  JOIN_NOT_STARTED: 'Online class has not started yet',
  JOIN_ALREADY_ENDED: 'Online class has already ended',
  JOIN_CANCELLED: 'Online class was cancelled',
  JOIN_LINK_NOT_READY: 'Online class meeting link is not ready',
} as const;

export const GOOGLE_OAUTH_ERRORS = {
  NOT_CONFIGURED: 'Google OAuth is not configured on this server',
  INVALID_STATE:
    'Invalid or expired Google sign-in session, please try connecting again',
  TOKEN_EXCHANGE_FAILED: 'Failed to complete Google sign-in',
  NO_REFRESH_TOKEN:
    'Google did not return a refresh token — reconnect and approve access when prompted',
  NOT_CONNECTED:
    'Connect your Google account before scheduling an online class',
  NEEDS_REAUTH:
    'Google authorization expired — please reconnect your Google account',
} as const;

// Conversation/message 404s share one message regardless of cause (doesn't exist,
// belongs to a different parent's ward, or the requester's authorization has since
// lapsed) — same 404-not-403 rule as ONLINE_CLASS_ERRORS above.
export const MESSAGING_ERRORS = {
  NOT_ACTIVE_FACULTY: 'Authenticated user is not an active faculty member',
  CONVERSATION_NOT_FOUND: 'Conversation not found',
  MESSAGE_NOT_FOUND: 'Message not found',
  IDEMPOTENCY_KEY_REQUIRED: 'Idempotency-Key header is required',
  EMPTY_MESSAGE: 'Message cannot be empty',
  MESSAGE_TOO_LONG: 'Message exceeds the maximum allowed length',
  UNSUPPORTED_LANGUAGE: 'Unsupported target language',
  TRANSLATION_NOT_CONFIGURED: 'Translation is not configured on this server',
  TRANSLATION_FAILED: 'Translation failed, please try again later',
} as const;

// Activity/request 404s share one message regardless of cause (doesn't exist,
// belongs to a different faculty/parent's scope, or authorization has since
// lapsed) — same 404-not-403 rule as ONLINE_CLASS_ERRORS/MESSAGING_ERRORS above.
export const PERMISSION_ERRORS = {
  NOT_ACTIVE_FACULTY: 'Authenticated user is not an active faculty member',
  ACTIVITY_NOT_FOUND: 'Permission activity not found',
  REQUEST_NOT_FOUND: 'Permission request not found',
  SECTION_NOT_FOUND: 'Section not found for the selected academic year',
  NO_ELIGIBLE_STUDENTS: 'No active students found for this section',
  STUDENT_NOT_ELIGIBLE:
    'One or more selected students are not actively enrolled in this class and academic year',
  INVALID_TIME_RANGE: 'endTime must be after startTime',
  INVALID_DEADLINE: 'Response deadline must be on or before the activity date',
  ACTIVITY_ALREADY_CANCELLED: 'This activity has already been cancelled',
  REQUEST_ALREADY_CANCELLED: 'This permission request has been cancelled',
  REQUEST_EXPIRED: 'The response deadline for this permission has passed',
  REQUEST_ALREADY_DECLINED:
    'This permission has already been declined and cannot be consented to',
  REQUEST_ALREADY_CONSENTED:
    'This permission has already been consented to and cannot be declined',
} as const;

// Sports Faculty operations — 404-not-403 for out-of-scope objects (a Faculty
// member with no live SPORTS_FACULTY assignment for a given sport/team gets the
// same "not found" as a genuinely nonexistent one), matching every other
// module's convention (see ONLINE_CLASS_ERRORS/MESSAGING_ERRORS/PERMISSION_ERRORS).
export const SPORTS_ERRORS = {
  NOT_ACTIVE_FACULTY: 'Authenticated user is not an active faculty member',
  NOT_AUTHORIZED_FOR_SPORT:
    'You are not assigned as Sports Faculty for this sport',
  TEAM_NOT_FOUND: 'Team not found',
  SPORT_NOT_FOUND: 'Sport not found',
  EQUIPMENT_NOT_FOUND: 'Equipment not found',
  EQUIPMENT_ISSUE_NOT_FOUND: 'Equipment issue not found',
  INSUFFICIENT_STOCK: 'Not enough equipment available to issue this quantity',
  ALREADY_RETURNED: 'This equipment issue has already been returned',
  ISSUE_REASON_REQUIRED: 'A reason is required to issue equipment',
  IDEMPOTENCY_KEY_REQUIRED: 'Idempotency-Key header is required',
  ROSTER_MEMBER_NOT_FOUND: 'Roster member not found',
  ALREADY_ON_ROSTER: 'This student is already on the team roster',
  OD_REQUEST_NOT_FOUND: 'On-duty request not found',
  NO_ACTIVE_ROSTER:
    'This team has no active roster members to request on-duty status for',
} as const;

export const PARENT_ERRORS = {
  NOT_LINKED_TO_STUDENT: 'You are not linked to this student',
  VIEW_ONLY_ACCESS:
    'Your access to this student is view-only — payments must be made by the primary guardian',
  FEE_LINES_NOT_FOUND:
    'One or more selected fees could not be found for this student',
  FEE_LINE_NOT_PAYABLE: 'One or more selected fees are not open for payment',
  AMOUNT_EXCEEDS_OUTSTANDING:
    'The amount entered is more than what is actually outstanding on the selected fees',
} as const;
