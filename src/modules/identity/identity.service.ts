// POST /auth/login, /auth/refresh, /auth/logout, GET /me.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditService } from '../../common/audit/audit.service';
import { AUTH_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { authError, generateOpaqueToken, hashToken } from './identity.util';
import { LoginIdentifierRepository } from './repositories/login-identifier.repository';
import {
  PersonAuthView,
  PersonRepository,
} from './repositories/person.repository';
import {
  ActiveRoleAssignment,
  RoleAssignmentRepository,
} from './repositories/role-assignment.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserCredentialRepository } from './repositories/user-credential.repository';

export interface DeviceContext {
  ipAddress: string | null;
  userAgent: string | null;
  /** X-Device-Id header: names this phone/browser install. Not a secret. */
  deviceId?: string | null;
}

export interface PersonSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
}

export interface RoleSummary {
  role_code: string;
  scope_type: string;
  scope_id: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  person: PersonSummary;
  roles: RoleSummary[];
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
    private readonly personRepo: PersonRepository,
    private readonly roleAssignmentRepo: RoleAssignmentRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, device: DeviceContext): Promise<LoginResult> {
    // 1. Identifier must exist and be verified. Not found -> same error as wrong
    // password; never reveal whether the identifier exists.
    const identifier = await this.loginIdentifierRepo.findVerifiedByValue(
      dto.identifier,
    );
    if (!identifier) {
      throw authError(AUTH_ERRORS.INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }

    // 2. Load credentials for that person.
    const credential = await this.userCredentialRepo.findByPersonId(
      identifier.personId,
    );
    if (!credential) {
      throw authError(AUTH_ERRORS.INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }

    // Load the person now (not after password verification) so status can be checked
    // up front, same reasoning as the lockout check below: don't spend a hash-check on
    // an account that can't log in regardless of the password.
    const person = await this.personRepo.findById(identifier.personId);
    if (!person) {
      // FK guarantees this can't happen; fail closed rather than trust that.
      throw authError(AUTH_ERRORS.INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }

    // Deactivated by Admin (Access module) -- distinct message is an accepted,
    // pre-existing tradeoff here: the lockout message already reveals "this account
    // exists and is locked" the same way, so this doesn't introduce a new category of
    // information leak.
    if (person.status !== 'ACTIVE') {
      await this.auditFailure(identifier.personId, device);
      throw authError(AUTH_ERRORS.ACCOUNT_DEACTIVATED, 'ACCOUNT_DEACTIVATED');
    }

    // 3. Lockout check BEFORE any password hashing — never spend a hash-check on an
    // already-locked account.
    if (
      credential.lockedUntil &&
      credential.lockedUntil.getTime() > Date.now()
    ) {
      await this.auditFailure(identifier.personId, device);
      throw authError(AUTH_ERRORS.ACCOUNT_LOCKED, 'ACCOUNT_LOCKED');
    }

    // 4. Verify password. argon2.verify reads the algorithm/cost parameters back out
    // of the stored PHC-format hash itself, so they aren't (and can't be) passed here
    // — ARGON2_OPTIONS is applied at hash-time instead (see password-reset.service.ts).
    const passwordMatches = await argon2
      .verify(credential.passwordHash, dto.password)
      .catch(() => false);

    if (!passwordMatches) {
      // 5. Wrong password: increment attempts, lock at threshold. Same error either way.
      await this.userCredentialRepo.recordFailedAttempt(
        identifier.personId,
        this.configService.get<number>('auth.lockoutThreshold')!,
        this.configService.get<number>('auth.lockoutMinutes')!,
      );
      await this.auditFailure(identifier.personId, device);
      throw authError(AUTH_ERRORS.INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }

    return this.unitOfWork.run(async (client) => {
      // 6. Correct password: reset lockout state, stamp last_login_at.
      await this.userCredentialRepo.recordSuccessfulLogin(
        identifier.personId,
        client,
      );

      // 7. Active role assignments.
      const roles = await this.roleAssignmentRepo.findActiveByPersonId(
        identifier.personId,
        client,
      );

      // 8-9. Issue tokens.
      const accessToken = this.signAccessToken(identifier.personId, roles);
      const { refreshToken, refreshTokenHash, expiresAt } =
        this.issueRefreshToken();

      await this.sessionRepo.create(
        {
          personId: identifier.personId,
          refreshTokenHash,
          devicePlatform: dto.devicePlatform ?? 'WEB',
          deviceLabel: dto.deviceLabel ?? null,
          deviceId: device.deviceId ?? null,
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
          expiresAt,
        },
        client,
      );

      await this.auditService.record(
        {
          actorPersonId: identifier.personId,
          actorRoleCode: roles[0]?.roleCode ?? null,
          action: 'LOGIN_SUCCESS',
          objectType: 'person',
          objectId: identifier.personId,
          outcome: 'SUCCESS',
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
        },
        client,
      );

      // 10. Return both tokens + person + roles.
      return {
        accessToken,
        refreshToken,
        person: this.toPersonSummary(person),
        roles: roles.map(this.toRoleSummary),
      };
    });
  }

  async refresh(
    dto: RefreshTokenDto,
    device: DeviceContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const incomingHash = hashToken(dto.refreshToken);
    const session = await this.sessionRepo.findByRefreshTokenHash(incomingHash);

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      // Not found or expired -> force full re-login.
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }

    const roles = await this.roleAssignmentRepo.findActiveByPersonId(
      session.personId,
    );
    const accessToken = this.signAccessToken(session.personId, roles);
    const { refreshToken, refreshTokenHash, expiresAt } =
      this.issueRefreshToken();

    await this.unitOfWork.run(async (client) => {
      // Rotation, not optional: the old hash stops matching the moment this commits. A
      // stolen token that gets used first makes the legitimate user's next refresh fail
      // on a hash that's gone -- that mismatch is the compromise signal. Done as an
      // in-place UPDATE (not delete + insert) so sessions minted by an account switch,
      // which hang off this row, are not cascade-deleted by a routine refresh.
      await this.sessionRepo.rotateRefreshToken(
        session.id,
        refreshTokenHash,
        expiresAt,
        client,
      );
      if (!session.deviceId && device.deviceId) {
        await this.sessionRepo.bindDeviceIfMissing(session.id, device.deviceId, client);
      }
      // A linked (switched-into) session keeps its parent alive while it is in use.
      if (session.linkedFromSessionId) {
        await this.sessionRepo.extendExpiry(
          session.linkedFromSessionId,
          expiresAt,
          client,
        );
      }
    });

    return { accessToken, refreshToken };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    // Deletes the matching row if present; no-op otherwise. The access token is left
    // to expire naturally (<=15 min) — expected, not a bug: it's never invalidated
    // server-side.
    const hash = hashToken(dto.refreshToken);
    // Signing out of a switched-into session ends the whole sign-in: deleting the
    // parent cascades to it, so the faculty session cannot linger on the server.
    const session = await this.sessionRepo.findByRefreshTokenHash(hash);
    if (session?.linkedFromSessionId) {
      await this.sessionRepo.deleteById(session.linkedFromSessionId);
      return;
    }
    await this.sessionRepo.deleteByRefreshTokenHash(hash);
  }

  async me(
    personId: string,
  ): Promise<{ person: PersonSummary; roles: RoleSummary[] }> {
    const person = await this.personRepo.findById(personId);
    if (!person) {
      throw new UnauthorizedException();
    }
    const roles = await this.roleAssignmentRepo.findActiveByPersonId(personId);
    return {
      person: this.toPersonSummary(person),
      roles: roles.map(this.toRoleSummary),
    };
  }

  /** Mints (or re-issues) a session for a person without a password check -- only for
   * callers that have ALREADY proven the right to it (see AccountLinkService). Pass
   * rotateSessionId to hand an existing session back to its owner instead of creating
   * a second one. */
  async issueSession(
    personId: string,
    opts: {
      deviceId: string | null;
      devicePlatform: 'WEB' | 'ANDROID' | 'IOS';
      deviceLabel: string | null;
      linkedFromSessionId?: string | null;
      rotateSessionId?: string | null;
    },
    device: DeviceContext,
    client?: import('../../infrastructure/postgres/postgres.service').Queryable,
  ): Promise<LoginResult & { sessionId: string }> {
    const person = await this.personRepo.findById(personId);
    if (!person || person.status !== 'ACTIVE') {
      throw authError(AUTH_ERRORS.ACCOUNT_DEACTIVATED, 'ACCOUNT_DEACTIVATED');
    }
    const roles = await this.roleAssignmentRepo.findActiveByPersonId(
      personId,
      client,
    );
    const accessToken = this.signAccessToken(personId, roles);
    const { refreshToken, refreshTokenHash, expiresAt } =
      this.issueRefreshToken();
    let sessionId: string;
    if (opts.rotateSessionId) {
      await this.sessionRepo.rotateRefreshToken(
        opts.rotateSessionId,
        refreshTokenHash,
        expiresAt,
        client,
      );
      sessionId = opts.rotateSessionId;
    } else {
      sessionId = await this.sessionRepo.create(
        {
          personId,
          refreshTokenHash,
          devicePlatform: opts.devicePlatform,
          deviceLabel: opts.deviceLabel,
          deviceId: opts.deviceId,
          linkedFromSessionId: opts.linkedFromSessionId ?? null,
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
          expiresAt,
        },
        client,
      );
    }
    return {
      sessionId,
      accessToken,
      refreshToken,
      person: this.toPersonSummary(person),
      roles: roles.map(this.toRoleSummary),
    };
  }

  private signAccessToken(
    personId: string,
    roles: ActiveRoleAssignment[],
  ): string {
    return this.jwtService.sign({
      sub: personId,
      roles: roles.map((r) => r.roleCode),
    });
  }

  private issueRefreshToken(): {
    refreshToken: string;
    refreshTokenHash: string;
    expiresAt: Date;
  } {
    const refreshToken = generateOpaqueToken();
    const ttlDays = this.configService.get<number>('auth.refreshTokenTtlDays')!;
    return {
      refreshToken,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    };
  }

  private toPersonSummary(person: PersonAuthView): PersonSummary {
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
    };
  }

  private toRoleSummary(role: ActiveRoleAssignment): RoleSummary {
    return {
      role_code: role.roleCode,
      scope_type: role.scopeType,
      scope_id: role.scopeId,
    };
  }

  /** Only called once the identifier is already confirmed to exist -- never audit-log
   * a lookup for an identifier that doesn't, or the audit trail itself becomes an
   * enumeration side-channel. */
  private async auditFailure(
    personId: string,
    device: DeviceContext,
  ): Promise<void> {
    await this.auditService.record({
      actorPersonId: personId,
      action: 'LOGIN_FAILURE',
      objectType: 'person',
      objectId: personId,
      outcome: 'DENIED',
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }
}
