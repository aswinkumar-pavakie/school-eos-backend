// Real login email + password scheme for every seeded account.
// Format: {roleword}{personname}{uniqueid}@sis.in — e.g. parentrajeshkumar022@sis.in,
// facultyrio090@sis.in, principaltarik090@sis.in. Seat-based logins (Class
// Advisor, Academic Coordinator) have no real individual behind the login
// itself, so they use a deterministic, nameless pattern instead — see
// seatEmail below.
import * as argon2 from "argon2";

export const TEST_PASSWORD = "SIS@test123";
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const EMAIL_DOMAIN = "sis.in";

let passwordHashCache: string | null = null;
export async function getPasswordHash(): Promise<string> {
  if (!passwordHashCache) passwordHashCache = await argon2.hash(TEST_PASSWORD, ARGON2_OPTIONS);
  return passwordHashCache;
}

// Per-role counter so the numeric suffix is real, sequential, and never
// collides — not a random guess that could clash under load.
const counters: Record<string, number> = {};
function nextId(rolePrefix: string): number {
  counters[rolePrefix] = (counters[rolePrefix] ?? 0) + 1;
  return counters[rolePrefix]!;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

/** Real per-person login email: {role}{name}{3-digit-id}@sis.in */
export function roleEmail(role: string, fullName: string): string {
  const id = nextId(role);
  return `${role}${slug(fullName)}${String(id).padStart(3, "0")}@${EMAIL_DOMAIN}`;
}

/** Deterministic seat-login email, no personal name (Class Advisor,
 * Academic Coordinator) — e.g. classadvisor1a@sis.in, academiccoordinator3@sis.in */
export function seatEmail(seatName: string): string {
  return `${seatName.toLowerCase().replace(/[^a-z0-9]/g, "")}@${EMAIL_DOMAIN}`;
}

import type { SeedContext } from "./db";

/** Creates login_identifier + user_credential for a person with the shared
 * SIS@test123 password (real argon2id hash matching identity.util.ts). */
export async function createLoginAndCredential(ctx: SeedContext, personId: string, email: string): Promise<void> {
  await ctx.insertReturningId("login_identifier", {
    person_id: personId, identifier_type: "EMAIL", value: email, is_verified: true, verified_at: new Date().toISOString(),
  });
  const hash = await getPasswordHash();
  await ctx.insertMany("user_credential",
    ["person_id", "password_hash", "password_algo", "password_set_at", "password_change_count", "must_change_password", "mfa_enabled", "failed_attempt_count", "reset_allowance_used", "admin_visible_password"],
    [[personId, hash, "argon2id", new Date().toISOString(), 0, false, false, 0, false, TEST_PASSWORD]]);
}
