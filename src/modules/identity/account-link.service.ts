// Linked account switching. Design + threat model:
// school-eos-website/rnd-linked-account-switching.md (approved).
//
// The server, not the phone, decides who may switch to what:
//  * ADD (once per phone, from the faculty account only): needs the admin's mapping
//    (this person currently holds the class) AND the class login's own password --
//    the second secret a leaked faculty password does not give.
//  * SWITCH (every time after): needs a live session on THIS phone plus an active
//    link for this phone. No password, and no tokens for the other account are
//    kept on the phone.
// A linked session hangs off its parent (ON DELETE CASCADE), so it cannot outlive
// the sign-in that created it.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuditService } from '../../common/audit/audit.service';
import { AUTH_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { LinkAccountDto, SwitchAccountDto } from './dto/account-link.dto';
import { DeviceContext, IdentityService, LoginResult } from './identity.service';
import { hashToken } from './identity.util';
import { AccountLinkRepository } from './repositories/account-link.repository';
import { LoginIdentifierRepository } from './repositories/login-identifier.repository';
import { PersonRepository } from './repositories/person.repository';
import { SessionRepository, UserSessionRow } from './repositories/session.repository';
import { UserCredentialRepository } from './repositories/user-credential.repository';

/** Phones one faculty member may link (R&D D-2). */
export const MAX_LINKED_DEVICES = 3;
/** Wrong "add account" attempts one person may make before a cool-off (protects the
 * class password from guessing without letting anyone lock the class login out). */
export const MAX_ADD_FAILURES = 5; // per phone/browser
export const MAX_ADD_FAILURES_PER_PERSON = 20; // across all their phones (ceiling)
export const ADD_COOLOFF_MINUTES = 15;
/** A link nobody uses for this long expires (R&D D-6). */
export const LINK_IDLE_DAYS = 90;

const NOT_ALLOWED_MESSAGE =
  'Those login details are not correct, or that class is not assigned to you.';

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

@Injectable()
export class AccountLinkService {
  constructor(
    private readonly linkRepo: AccountLinkRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly personRepo: PersonRepository,
    private readonly identityService: IdentityService,
    private readonly unitOfWork: UnitOfWork,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  private requireDevice(device: DeviceContext): string {
    if (!device.deviceId) {
      throw new BadRequestException(
        'This app version cannot link accounts. Please update the app.',
      );
    }
    return device.deviceId;
  }

  /** The caller's live session on THIS phone, proven by their current refresh token. */
  private async requireLiveSession(
    callerPersonId: string,
    refreshToken: string,
    deviceId: string,
  ): Promise<UserSessionRow> {
    const session = await this.sessionRepo.findByRefreshTokenHash(hashToken(refreshToken));
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.personId !== callerPersonId
    ) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }
    // A session created before this feature has no device id; it must sign in again
    // once so it is bound to this phone.
    if (!session.deviceId || session.deviceId !== deviceId) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }
    return session;
  }

  /** The classes ALREADY added on THIS phone (and still mapped by the admin). Nothing else
   * is disclosed: a session on a phone that has not added anything -- e.g. someone using a
   * leaked Faculty password -- sees an empty list, not which classes are assigned or what
   * their login emails are. */
  async available(ownerPersonId: string, device: DeviceContext) {
    const seats = await this.linkRepo.listLinkedHere(ownerPersonId, device.deviceId ?? null);
    return seats.map((s) => ({
      linkedPersonId: s.linkedPersonId,
      label: `${s.gradeName}-${s.sectionName}`,
      email: s.email,
      emailHint: maskEmail(s.email),
      linkedOnThisDevice: true,
    }));
  }

  async list(ownerPersonId: string) {
    const items = await this.linkRepo.listForOwner(ownerPersonId);
    return items.map((l) => ({
      id: l.id,
      linkedPersonId: l.linkedPersonId,
      label: l.gradeName && l.sectionName ? `${l.gradeName}-${l.sectionName}` : 'Linked account',
      deviceLabel: l.deviceLabel,
      createdAt: l.createdAt,
      lastUsedAt: l.lastUsedAt,
    }));
  }

  async link(
    ownerPersonId: string,
    dto: LinkAccountDto,
    device: DeviceContext,
  ): Promise<LoginResult & { linkedLabel: string | null }> {
    const deviceId = this.requireDevice(device);
    const session = await this.requireLiveSession(ownerPersonId, dto.refreshToken, deviceId);
    await this.expireIdleLinks().catch(() => undefined);

    // Cool-off: too many refused attempts recently => stop, without touching any class login.
    // Counted PER PHONE so someone on another phone (a leaked Faculty password) cannot use
    // up the real teacher's attempts; a higher person-wide ceiling stops device-hopping.
    const [onThisDevice, acrossDevices] = await Promise.all([
      this.linkRepo.countRecentAddFailures(ownerPersonId, ADD_COOLOFF_MINUTES, deviceId),
      this.linkRepo.countRecentAddFailures(ownerPersonId, ADD_COOLOFF_MINUTES),
    ]);
    if (onThisDevice >= MAX_ADD_FAILURES || acrossDevices >= MAX_ADD_FAILURES_PER_PERSON) {
      throw new HttpException(
        `Too many attempts. Please wait ${ADD_COOLOFF_MINUTES} minutes and try again.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // R1: only what the admin mapped to this person. ONE message for every reason (email
    // unknown, class not assigned to me, wrong password), so this cannot be used to probe
    // which logins exist or which passwords are right.
    const target = await this.loginIdentifierRepo.findVerifiedByValue(dto.identifier.trim());
    const linkedPersonId = target?.personId ?? null;
    if (!linkedPersonId || !(await this.linkRepo.isCurrentHolder(ownerPersonId, linkedPersonId))) {
      await this.deny(ownerPersonId, linkedPersonId ?? ownerPersonId, 'NOT_MAPPED', device);
      throw new UnauthorizedException(NOT_ALLOWED_MESSAGE);
    }

    await this.verifyLinkedPassword(ownerPersonId, linkedPersonId, dto.password, device);

    if ((await this.linkRepo.countOtherActiveDevices(ownerPersonId, deviceId)) >= MAX_LINKED_DEVICES) {
      throw new ConflictException(
        `You can link this account on up to ${MAX_LINKED_DEVICES} phones. Remove one first.`,
      );
    }

    return this.unitOfWork.run(async (client) => {
      const link = await this.linkRepo.createOrTouch(
        {
          ownerPersonId,
          linkedPersonId: linkedPersonId,
          deviceId,
          deviceLabel: dto.deviceLabel ?? session.deviceLabel,
        },
        client,
      );
      // Re-adding on the same phone reuses the existing switched-in session.
      const existing = await this.sessionRepo.findChild(session.id, linkedPersonId, client);
      const result = await this.identityService.issueSession(
        linkedPersonId,
        {
          deviceId,
          devicePlatform: dto.devicePlatform ?? session.devicePlatform,
          deviceLabel: dto.deviceLabel ?? session.deviceLabel,
          linkedFromSessionId: session.id,
          rotateSessionId: existing?.id ?? null,
        },
        device,
        client,
      );
      await this.userCredentialRepo.recordSuccessfulLogin(linkedPersonId, client);
      await this.auditService.record(
        {
          actorPersonId: ownerPersonId,
          action: 'ACCOUNT_LINK_CREATED',
          objectType: 'account_link',
          objectId: link.id,
          outcome: 'SUCCESS',
          afterData: { linkedPersonId: linkedPersonId, deviceId },
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
        },
        client,
      );
      const { sessionId: _sessionId, ...login } = result;
      return { ...login, linkedLabel: await this.linkRepo.findSeatLabel(linkedPersonId, client) };
    });
  }

  async switchTo(
    callerPersonId: string,
    dto: SwitchAccountDto,
    device: DeviceContext,
  ): Promise<LoginResult> {
    const deviceId = this.requireDevice(device);
    if (dto.targetPersonId === callerPersonId) {
      throw new BadRequestException('You are already using that account.');
    }
    const session = await this.requireLiveSession(callerPersonId, dto.refreshToken, deviceId);

    const link = await this.linkRepo.findActiveBetween(callerPersonId, dto.targetPersonId, deviceId);
    if (!link) {
      await this.deny(callerPersonId, dto.targetPersonId, 'NOT_LINKED_ON_DEVICE', device);
      throw new ForbiddenException('That account is not linked on this phone.');
    }
    // The mapping can end between switches (admin changed the teacher): re-check it.
    if (!(await this.linkRepo.isCurrentHolder(link.ownerPersonId, link.linkedPersonId))) {
      await this.linkRepo.revokeById(link.id, 'MAPPING_ENDED');
      await this.deny(callerPersonId, dto.targetPersonId, 'MAPPING_ENDED', device);
      throw new ForbiddenException('That class is no longer assigned to this account.');
    }

    return this.unitOfWork.run(async (client) => {
      let result: LoginResult & { sessionId: string };
      const parent = session.linkedFromSessionId
        ? await this.sessionRepo.findById(session.linkedFromSessionId, client)
        : null;

      if (session.linkedFromSessionId && parent?.personId === dto.targetPersonId) {
        // Going BACK: hand the parent session its new tokens and drop this child.
        if (parent.expiresAt.getTime() <= Date.now()) {
          throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
        }
        result = await this.identityService.issueSession(
          dto.targetPersonId,
          {
            deviceId,
            devicePlatform: parent.devicePlatform,
            deviceLabel: parent.deviceLabel,
            rotateSessionId: parent.id,
          },
          device,
          client,
        );
        await this.sessionRepo.deleteById(session.id, client);
      } else {
        // A switched-into session may only go back to the account it came from.
        if (session.linkedFromSessionId) {
          throw new ForbiddenException('You can only switch back from this account.');
        }
        // Going OUT: reuse the child this session already minted, else create one.
        const child = await this.sessionRepo.findChild(session.id, dto.targetPersonId, client);
        result = await this.identityService.issueSession(
          dto.targetPersonId,
          {
            deviceId,
            devicePlatform: session.devicePlatform,
            deviceLabel: session.deviceLabel,
            linkedFromSessionId: session.id,
            rotateSessionId: child?.id ?? null,
          },
          device,
          client,
        );
      }

      await this.linkRepo.touch(link.id, client);
      await this.auditService.record(
        {
          actorPersonId: callerPersonId,
          action: 'ACCOUNT_LINK_USED',
          objectType: 'account_link',
          objectId: link.id,
          outcome: 'SUCCESS',
          afterData: { targetPersonId: dto.targetPersonId, deviceId },
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
        },
        client,
      );
      const { sessionId: _sessionId, ...login } = result;
      return login;
    });
  }

  /** Owner removes one phone's link ("Remove this phone"). */
  async remove(ownerPersonId: string, linkId: string): Promise<{ removed: true }> {
    const link = await this.linkRepo.findOwnedById(linkId, ownerPersonId);
    if (!link) throw new NotFoundException('Linked account not found.');
    await this.linkRepo.revokeById(linkId, 'OWNER_REMOVED');
    await this.auditService.record({
      actorPersonId: ownerPersonId,
      action: 'ACCOUNT_LINK_REVOKED',
      objectType: 'account_link',
      objectId: linkId,
      outcome: 'SUCCESS',
      afterData: { reason: 'OWNER_REMOVED' },
    });
    return { removed: true };
  }

  /** Housekeeping: links unused for LINK_IDLE_DAYS expire. */
  async expireIdleLinks(): Promise<number> {
    return this.linkRepo.revokeIdle(LINK_IDLE_DAYS);
  }

  // ---- internals ---------------------------------------------------------------

  /** Same lockout + hashing rules as a normal login, for the class login's password. */
  private async verifyLinkedPassword(
    ownerPersonId: string,
    linkedPersonId: string,
    password: string,
    device: DeviceContext,
  ): Promise<void> {
    const [person, credential] = await Promise.all([
      this.personRepo.findById(linkedPersonId),
      this.userCredentialRepo.findByPersonId(linkedPersonId),
    ]);
    if (!person || !credential) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    if (person.status !== 'ACTIVE') {
      throw new UnauthorizedException(AUTH_ERRORS.ACCOUNT_DEACTIVATED);
    }
    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      await this.deny(ownerPersonId, linkedPersonId, 'LOCKED', device);
      throw new UnauthorizedException(AUTH_ERRORS.ACCOUNT_LOCKED);
    }
    const ok = await argon2.verify(credential.passwordHash, password).catch(() => false);
    if (!ok) {
      await this.deny(ownerPersonId, linkedPersonId, 'WRONG_PASSWORD', device);
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
  }

  private async deny(
    actorPersonId: string,
    targetPersonId: string,
    reason: string,
    device: DeviceContext,
  ): Promise<void> {
    await this.auditService.record({
      actorPersonId,
      action: 'ACCOUNT_LINK_DENIED',
      objectType: 'person',
      objectId: targetPersonId,
      outcome: 'DENIED',
      afterData: { reason, deviceId: device.deviceId ?? null },
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }
}
