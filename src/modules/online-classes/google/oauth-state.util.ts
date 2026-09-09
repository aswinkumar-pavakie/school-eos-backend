// Signs/verifies the short-lived `state` param round-tripped through Google's consent
// screen. Google's redirect back to /callback is a plain browser navigation — it never
// carries our Authorization header — so this is how the callback knows which faculty
// initiated the request, and that the request wasn't forged.
//
// Deliberately plain HMAC-SHA256 via crypto (mirrors identity.util.ts's hashToken/
// generateOpaqueToken style) rather than pulling in JwtModule for a second, unrelated
// token purpose — this reuses the existing JWT_ACCESS_SECRET, but the actual
// authorization decision is re-checked from scratch server-side in the callback
// (staff must still resolve and be active), so this token only needs to prove
// "this round-trip wasn't tampered with," not carry any authority itself.

import { createHmac, timingSafeEqual } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a consent screen, no longer

export function signOAuthState(personId: string, secret: string): string {
  const payload = JSON.stringify({ personId, exp: Date.now() + STATE_TTL_MS });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
): { personId: string } | null {
  const [payloadB64, signature] = state.split('.');
  if (!payloadB64 || !signature) return null;

  const expectedSignature = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as {
      personId: string;
      exp: number;
    };
    if (typeof payload.personId !== 'string' || Date.now() > payload.exp) {
      return null;
    }
    return { personId: payload.personId };
  } catch {
    return null;
  }
}
