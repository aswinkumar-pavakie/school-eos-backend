// Thin wrapper over Expo's own push notification HTTP API -- no new
// dependency needed (plain fetch, same reasoning as everywhere else in this
// codebase that avoids a client SDK for a single HTTP call). Free for any
// real volume this school will ever produce; an EXPO_ACCESS_TOKEN env var is
// optional (Expo recommends it for reliability at scale, not required to
// send at all) -- read here if present, omitted from the request otherwise.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Sends one message to one real device. Expo's batch endpoint accepts many
 * at once, but this module calls it once per delivery row (matches the
 * granularity notification_delivery itself already tracks at) -- fine at
 * this school's real volume; batch later if it ever needs to. */
export async function sendExpoPush(message: ExpoPushMessage): Promise<ExpoPushTicket> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
  const body = (await res.json()) as { data?: ExpoPushTicket; errors?: unknown[] };
  if (!res.ok || !body.data) {
    throw new Error(`Expo push failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data;
}

/** A token like "ExponentPushToken[xxxx]" or "ExpoPushToken[xxxx]" -- this is
 * the one real, cheap validity check worth doing before ever calling Expo's
 * API with it (catches a client sending garbage, not a substitute for
 * Expo's own receipt-based invalid-token reporting). */
export function isPlausibleExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}
