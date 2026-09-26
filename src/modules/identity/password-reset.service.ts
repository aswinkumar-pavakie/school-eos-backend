// Self-service password reset (OTP-gated, one-time-use) and the admin-authorized
// reset that re-opens it. Kept separate from IdentityService: session/token concerns
// and the reset_allowance_used state machine are different enough to warrant their
// own file, even though both touch user_credential.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AUTH_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { AdminPasswordResetDto } from '../admin/dto/admin-password-reset.dto';
import { PasswordResetCompleteDto } from './dto/password-reset-complete.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import {
  ARGON2_OPTIONS,
  generateOtpCode,
  generateTempPassword,
  hashToken,
} from './identity.util';
import { AccountLinkRepository } from './repositories/account-link.repository';
import { LoginIdentifierRepository } from './repositories/login-identifier.repository';
import { OtpChallengeRepository } from './repositories/otp-challenge.repository';
import { PersonRepository } from './repositories/person.repository';
import { RoleAssignmentRepository } from './repositories/role-assignment.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserCredentialRepository } from './repositories/user-credential.repository';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly personRepo: PersonRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
    private readonly otpChallengeRepo: OtpChallengeRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly roleAssignmentRepo: RoleAssignmentRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly configService: ConfigService,
    private readonly postgres: PostgresService,
    private readonly linkRepo: AccountLinkRepository,
  ) {}

  /** A class-teacher login is shared: only the admin sets its password (and the
   * admin screen shows the current one), so it never goes through self-service
   * reset -- the code would go to a shared address nobody owns. */
  private async assertNotSharedLogin(personId: string): Promise<void> {
    const { rows } = await this.postgres.query(
      `SELECT 1 FROM class_teacher_login WHERE login_person_id = $1`,
      [personId],
    );
    if (rows.length > 0) {
      throw new ForbiddenException(
        'This is a shared class login. Ask the school administrator to reset its password.',
      );
    }
  }

  async requestReset(dto: PasswordResetRequestDto): Promise<void> {
    const identifier = await this.loginIdentifierRepo.findVerifiedByValue(
      dto.identifier,
    );
    if (!identifier) {
      // Same "never reveal existence" posture as login: no-op, indistinguishable from
      // the success path to the caller.
      return;
    }

    const credential = await this.userCredentialRepo.findByPersonId(
      identifier.personId,
    );
    if (!credential) {
      return;
    }

    await this.assertNotSharedLogin(identifier.personId);

    if (credential.resetAllowanceUsed) {
      throw new ForbiddenException(AUTH_ERRORS.RESET_ALREADY_USED);
    }

    const person = await this.personRepo.findById(identifier.personId);
    const destination = person?.mobile ?? person?.email;
    if (!destination) {
      return; // no channel on file to deliver to; nothing safe to do
    }

    const code = generateOtpCode();
    const codeHash = hashToken(code);
    const ttlMinutes = this.configService.get<number>('auth.otpTtlMinutes')!;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.otpChallengeRepo.create(
      identifier.personId,
      'PASSWORD_RESET',
      destination,
      codeHash,
      expiresAt,
    );

    // No real SMS/email delivery gateway is wired up yet -- this is a known,
    // pre-existing gap (self-service reset has no production delivery channel
    // today), tracked separately from this fix. The OTP itself must never be
    // logged, so nothing is printed here; building the actual gateway is a
    // separate, distinctly-scoped piece of work.
  }

  /** `deviceId` is the phone the reset was completed on (X-Device-Id): its links
   * survive, every other phone's links are revoked -- the owner keeps working, a
   * phone an attacker had linked does not. */
  async completeReset(
    dto: PasswordResetCompleteDto,
    deviceId: string | null = null,
  ): Promise<void> {
    const identifier = await this.loginIdentifierRepo.findVerifiedByValue(
      dto.identifier,
    );
    if (!identifier) {
      throw new BadRequestException(AUTH_ERRORS.INVALID_OTP);
    }
    await this.assertNotSharedLogin(identifier.personId);

    const challenge = await this.otpChallengeRepo.findLatestPending(
      identifier.personId,
      'PASSWORD_RESET',
    );
    if (!challenge) {
      throw new BadRequestException(AUTH_ERRORS.INVALID_OTP);
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(AUTH_ERRORS.INVALID_OTP);
    }
    if (challenge.attemptCount >= challenge.maxAttempts) {
      throw new BadRequestException(AUTH_ERRORS.INVALID_OTP);
    }

    if (hashToken(dto.otp) !== challenge.codeHash) {
      // Safe: attemptCount < maxAttempts was just checked, so +1 can't violate the
      // table's CHECK (attempt_count <= max_attempts).
      await this.otpChallengeRepo.incrementAttempt(challenge.id);
      throw new BadRequestException(AUTH_ERRORS.INVALID_OTP);
    }

    const passwordHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);

    await this.unitOfWork.run(async (client) => {
      await this.userCredentialRepo.completeSelfServiceReset(
        identifier.personId,
        passwordHash,
        client,
      );
      await this.otpChallengeRepo.markConsumed(challenge.id, client);
      // A reset implies the old credential may have been compromised — every existing
      // session is revoked so it can't be ridden out after the password changes.
      await this.linkRepo.revokeForOwner(
        identifier.personId,
        'PASSWORD_RESET',
        deviceId,
        client,
      );
      await this.sessionRepo.deleteAllForPerson(identifier.personId, client);
    });
  }

  /**
   * Admin-authorized reset. newPassword is optional in the request body: if supplied,
   * the admin sets it explicitly; if omitted, a random temporary password is generated
   * and returned once in the response — it is never stored in plaintext or logged.
   */
  async adminReset(
    personId: string,
    dto: AdminPasswordResetDto,
  ): Promise<{ newPassword: string }> {
    const credential = await this.userCredentialRepo.findByPersonId(personId);
    if (!credential) {
      throw new NotFoundException('Parent not found');
    }

    const roles = await this.roleAssignmentRepo.findActiveByPersonId(personId);
    if (!roles.some((r) => r.roleCode === 'PARENT')) {
      throw new NotFoundException('Parent not found');
    }

    const newPassword = dto.newPassword ?? generateTempPassword();
    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

    await this.unitOfWork.run(async (client) => {
      await this.userCredentialRepo.completeAdminReset(
        personId,
        passwordHash,
        client,
      );
      await this.sessionRepo.deleteAllForPerson(personId, client);
    });

    return { newPassword };
  }
}
