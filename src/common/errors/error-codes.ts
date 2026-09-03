// Auth-module error message constants — kept literal and centralized so the exact
// contract strings (relied on by every frontend track) can't drift between call sites.

export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_LOCKED: 'Account temporarily locked. Try again later.',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
  RESET_ALREADY_USED: 'Self-service reset already used. Contact school office.',
  INVALID_OTP: 'Invalid or expired OTP',
} as const;
