import { authError } from './identity.util';
import { AUTH_ERRORS } from '../../common/errors/error-codes';

describe('authError', () => {
  it('produces the exact same statusCode/error/message shape UnauthorizedException(message) already produced, plus an additive code', () => {
    const exception = authError(
      AUTH_ERRORS.INVALID_CREDENTIALS,
      'INVALID_CREDENTIALS',
    );

    expect(exception.getStatus()).toBe(401);
    expect(exception.getResponse()).toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
      error: 'Unauthorized',
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('keeps wrong-password and unknown-identifier on the identical message + code (no new distinguishing info)', () => {
    const wrongPassword = authError(
      AUTH_ERRORS.INVALID_CREDENTIALS,
      'INVALID_CREDENTIALS',
    );
    const unknownIdentifier = authError(
      AUTH_ERRORS.INVALID_CREDENTIALS,
      'INVALID_CREDENTIALS',
    );

    expect(wrongPassword.getResponse()).toEqual(
      unknownIdentifier.getResponse(),
    );
  });

  it('gives ACCOUNT_LOCKED and ACCOUNT_DEACTIVATED their own distinct, already-safe messages and codes', () => {
    const locked = authError(AUTH_ERRORS.ACCOUNT_LOCKED, 'ACCOUNT_LOCKED');
    const deactivated = authError(
      AUTH_ERRORS.ACCOUNT_DEACTIVATED,
      'ACCOUNT_DEACTIVATED',
    );

    expect(locked.getResponse()).toMatchObject({
      message: 'Account temporarily locked. Try again later.',
      code: 'ACCOUNT_LOCKED',
    });
    expect(deactivated.getResponse()).toMatchObject({
      message: 'This account has been deactivated. Contact school office.',
      code: 'ACCOUNT_DEACTIVATED',
    });
  });
});
