// Phase 6 ONLY: builds the Google consent URL and handles the redirect back, storing
// an encrypted refresh token. Deliberately stops there — no Calendar/Meet API call is
// made anywhere in this file. Phase 7 is responsible for actually using the stored
// connection to create events.

import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Credentials, OAuth2Client } from 'google-auth-library';
import { GOOGLE_OAUTH_ERRORS, ONLINE_CLASS_ERRORS } from '../../../common/errors/error-codes';
import { GoogleAccountConnectionRepository } from '../repositories/google-account-connection.repository';
import { StaffRepository } from '../repositories/staff.repository';
import { encryptRefreshToken } from './google-token-crypto.util';
import { signOAuthState, verifyOAuthState } from './oauth-state.util';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
];

export interface GoogleCallbackResult {
  success: boolean;
  message: string;
  googleAccountEmail?: string;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly staffRepo: StaffRepository,
    private readonly connectionRepo: GoogleAccountConnectionRepository,
  ) {}

  async buildConsentUrl(personId: string): Promise<string> {
    // Resolved (and validated) up front so a deactivated/non-faculty caller fails
    // before we even build a URL, not after Google's consent screen. staff.id itself
    // isn't needed in the URL — the callback re-resolves it from `state`.
    await this.requireActiveFaculty(personId);

    const client = this.buildOAuthClient();
    const stateSecret = this.configService.get<string>('jwt.accessSecret')!;
    const state = signOAuthState(personId, stateSecret);

    // access_type=offline + prompt=consent: guarantees a refresh_token every time,
    // including on a reconnect — Google otherwise only issues one on first consent.
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state,
    });
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    error: string | undefined,
  ): Promise<GoogleCallbackResult> {
    if (error) {
      // User declined consent on Google's screen — an expected outcome, not a server error.
      return { success: false, message: 'Google sign-in was cancelled' };
    }

    const stateSecret = this.configService.get<string>('jwt.accessSecret')!;
    const verified = state ? verifyOAuthState(state, stateSecret) : null;
    if (!verified || !code) {
      throw new ForbiddenException(GOOGLE_OAUTH_ERRORS.INVALID_STATE);
    }

    const staff = await this.requireActiveFaculty(verified.personId);
    const client = this.buildOAuthClient();

    let tokens: Credentials;
    try {
      ({ tokens } = await client.getToken(code));
    } catch {
      throw new ServiceUnavailableException(GOOGLE_OAUTH_ERRORS.TOKEN_EXCHANGE_FAILED);
    }

    if (!tokens.refresh_token) {
      // Shouldn't happen with access_type=offline+prompt=consent, but never silently
      // "succeed" with nothing to store.
      return { success: false, message: GOOGLE_OAUTH_ERRORS.NO_REFRESH_TOKEN };
    }

    let googleAccountEmail: string | undefined;
    let googleUserId: string | null = null;
    if (tokens.id_token) {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.configService.get<string>('google.oauthClientId'),
      });
      const payload = ticket.getPayload();
      googleAccountEmail = payload?.email;
      googleUserId = payload?.sub ?? null;
    }
    if (!googleAccountEmail) {
      throw new ServiceUnavailableException(GOOGLE_OAUTH_ERRORS.TOKEN_EXCHANGE_FAILED);
    }

    const encryptionKeys = this.configService.get<Record<string, string>>(
      'google.tokenEncryptionKeys',
    )!;
    const { ciphertext, keyId } = encryptRefreshToken(tokens.refresh_token, encryptionKeys);

    await this.connectionRepo.upsert({
      staffId: staff.id,
      googleAccountEmail,
      googleUserId,
      refreshTokenEncrypted: ciphertext,
      encryptionKeyId: keyId,
      tokenScope: tokens.scope ?? GOOGLE_SCOPES.join(' '),
    });

    return { success: true, message: 'Google account connected', googleAccountEmail };
  }

  private buildOAuthClient(): OAuth2Client {
    const clientId = this.configService.get<string>('google.oauthClientId');
    const clientSecret = this.configService.get<string>('google.oauthClientSecret');
    const redirectUri = this.configService.get<string>('google.oauthRedirectUri');
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException(GOOGLE_OAUTH_ERRORS.NOT_CONFIGURED);
    }
    return new OAuth2Client({ clientId, clientSecret, redirectUri });
  }

  private async requireActiveFaculty(personId: string) {
    const staff = await this.staffRepo.findByPersonId(personId);
    if (!staff || staff.status === 'EXITED') {
      throw new ForbiddenException(ONLINE_CLASS_ERRORS.NOT_FACULTY);
    }
    return staff;
  }
}
