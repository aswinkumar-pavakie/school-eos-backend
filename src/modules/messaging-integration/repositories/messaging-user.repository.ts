// Backs the two "user projection" internal endpoints (GET
// /internal/v1/messaging/users/:personId and the paginated listing) — the
// minimal profile data Messaging's directory/discovery needs, and the live
// `messagingEnabled` computation (see messaging-roles.constant.ts for why this
// is a computed predicate, not a stored column).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrlSql } from '../../../infrastructure/storage/public-photo-url.util';
import { MESSAGING_ENABLED_ROLE_CODES } from '../messaging-roles.constant';

export interface MessagingUserProjection {
  personId: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  profilePhotoUrl: string | null;
  roles: string[];
  messagingEnabled: boolean;
}

const PROJECTION_COLUMNS = `p.id AS person_id, p.first_name, p.last_name, p.display_name,
  ${personPhotoPublicUrlSql('p.photo_object_key')} AS profile_photo_url`;

@Injectable()
export class MessagingUserRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Null if the person doesn't exist at all — a genuinely unknown personId,
   * never fabricated. A real, ACTIVE-or-not person with zero messaging-enabled
   * roles still resolves (messagingEnabled: false), matching "not discoverable"
   * rather than "not found" for the LLD's own §27 rule. */
  async getProjection(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<MessagingUserProjection | null> {
    const { rows } = await executor.query<{
      person_id: string;
      first_name: string;
      last_name: string | null;
      display_name: string;
      profile_photo_url: string | null;
      status: string;
    }>(
      `SELECT ${PROJECTION_COLUMNS}, p.status
       FROM person p
       WHERE p.id = $1`,
      [personId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];

    const { rows: roleRows } = await executor.query<{ role_code: string }>(
      `SELECT DISTINCT role_code FROM v_active_role_assignment WHERE person_id = $1`,
      [personId],
    );
    const roles = roleRows.map((r) => r.role_code);
    const messagingEnabled =
      row.status === 'ACTIVE' &&
      roles.some((r) => (MESSAGING_ENABLED_ROLE_CODES as readonly string[]).includes(r));

    return {
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      profilePhotoUrl: row.profile_photo_url,
      roles,
      messagingEnabled,
    };
  }

  /** Same data as getProjection, batched -- ONE query for person rows plus
   * ONE query for roles, instead of a caller firing getProjection once per
   * id. Directory discovery's scoped-contacts resolution can legitimately
   * need hundreds of projections at once (e.g. a Class Advisor's full
   * section roster); doing that as N parallel single-id round trips was
   * exhausting the connection pool and crashing with a 500 under exactly
   * that load. Missing/nonexistent ids are simply absent from the result,
   * same "null means truly not found" contract as getProjection, just
   * expressed as omission instead of null in a list. */
  async getProjectionsBatch(
    personIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<MessagingUserProjection[]> {
    if (personIds.length === 0) return [];

    const { rows } = await executor.query<{
      person_id: string;
      first_name: string;
      last_name: string | null;
      display_name: string;
      profile_photo_url: string | null;
      status: string;
    }>(
      `SELECT ${PROJECTION_COLUMNS}, p.status
       FROM person p
       WHERE p.id = ANY($1::uuid[])`,
      [personIds],
    );
    if (rows.length === 0) return [];

    const { rows: roleRows } = await executor.query<{
      person_id: string;
      role_code: string;
    }>(
      `SELECT DISTINCT person_id, role_code FROM v_active_role_assignment WHERE person_id = ANY($1::uuid[])`,
      [personIds],
    );
    const rolesByPerson = new Map<string, string[]>();
    for (const r of roleRows) {
      const list = rolesByPerson.get(r.person_id) ?? [];
      list.push(r.role_code);
      rolesByPerson.set(r.person_id, list);
    }

    return rows.map((row) => {
      const roles = rolesByPerson.get(row.person_id) ?? [];
      return {
        personId: row.person_id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
        profilePhotoUrl: row.profile_photo_url,
        roles,
        messagingEnabled:
          row.status === 'ACTIVE' &&
          roles.some((r) => (MESSAGING_ENABLED_ROLE_CODES as readonly string[]).includes(r)),
      };
    });
  }

  /** Every currently messaging-enabled, ACTIVE person, keyset-paginated by
   * person.id (a stable, collision-free cursor — no ordering semantics are
   * required of this "unscoped, request-required" pool per LLD §18 step 5,
   * just a consistent, resumable one). Excludes the caller and, optionally, a
   * caller-supplied set of person IDs already reachable directly (Messaging
   * subtracts its own scoped set before calling this, but excludePersonId
   * lets a single obvious self-exclusion happen server-side too). */
  async listMessagingEnabled(
    params: { cursor?: string; limit: number; excludePersonId?: string },
    executor: Queryable = this.postgres,
  ): Promise<MessagingUserProjection[]> {
    const conditions = [
      `p.status = 'ACTIVE'`,
      `vra.role_code = ANY($1::text[])`,
    ];
    const values: unknown[] = [MESSAGING_ENABLED_ROLE_CODES as unknown as string[]];

    if (params.excludePersonId) {
      values.push(params.excludePersonId);
      conditions.push(`p.id != $${values.length}`);
    }
    if (params.cursor) {
      values.push(params.cursor);
      conditions.push(`p.id > $${values.length}`);
    }
    values.push(params.limit);

    const { rows } = await executor.query<{
      person_id: string;
      first_name: string;
      last_name: string | null;
      display_name: string;
      profile_photo_url: string | null;
      roles: string[];
    }>(
      `SELECT DISTINCT ${PROJECTION_COLUMNS}, ARRAY_AGG(DISTINCT vra.role_code) AS roles
       FROM person p
       JOIN v_active_role_assignment vra ON vra.person_id = p.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY p.id, p.first_name, p.last_name, p.display_name, p.photo_object_key
       ORDER BY p.id
       LIMIT $${values.length}`,
      values,
    );
    return rows.map((row) => ({
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      profilePhotoUrl: row.profile_photo_url,
      roles: row.roles,
      messagingEnabled: true,
    }));
  }
}
