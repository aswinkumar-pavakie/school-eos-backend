// Sports-Faculty source of truth: role_assignment with role_code='SPORTS_FACULTY',
// scope_type='SPORT' (scope_id=<sport.id>), status='ACTIVE'. Mirrors the exact
// pattern already verified for CLASS_ADVISOR (see permissions/messaging's own
// class-advisor.repository.ts) — a generic scoped role_assignment row, not a
// dedicated table. A Faculty member is scoped to sport(s), never school-wide;
// team-level authorization is derived by joining team.sport_id back to this.
//
// NOTE: requires a `role` row for code='SPORTS_FACULTY' to exist before any
// role_assignment can reference it (role_assignment.role_code has an FK to
// role.code) — see query.md.
//
// SPORTS_ADMIN (2026-09, see 0019_sports_admin_role.sql) is a genuinely
// different, school-wide login role — every method here now takes the full
// AuthenticatedUser (not just personId) and short-circuits to "authorized for
// every real sport" for that role, never touching role_assignment/staff at
// all for it (a Sports Admin account need not hold a SPORTS_FACULTY scope row
// or even a staff record — it's a distinct login, same relationship MEDIA_ROOM
// has to the whole Media module, not a Faculty sub-scope).

import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class SportsFacultyRepository {
  constructor(private readonly postgres: PostgresService) {}

  private async findAllSportIds(executor: Queryable): Promise<string[]> {
    const { rows } = await executor.query<{ id: string }>(`SELECT id FROM sport`);
    return rows.map((r) => r.id);
  }

  /** Every sport.id this actor is currently authorized for -- every real
   * sport for a SPORTS_ADMIN login, or only the sport(s) an ACTIVE
   * SPORTS_FACULTY role_assignment names for a FACULTY login. */
  async findActiveSportIdsForFaculty(
    actor: AuthenticatedUser,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    if (actor.roles.includes('SPORTS_ADMIN')) {
      return this.findAllSportIds(executor);
    }
    const { rows } = await executor.query<{ sport_id: string }>(
      `SELECT DISTINCT ra.scope_id AS sport_id
       FROM role_assignment ra
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       WHERE ra.role_code = 'SPORTS_FACULTY' AND ra.scope_type = 'SPORT'
         AND ra.person_id = $1 AND ra.status = 'ACTIVE'`,
      [actor.personId],
    );
    return rows.map((r) => r.sport_id);
  }

  async isAuthorizedForSport(
    actor: AuthenticatedUser,
    sportId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    if (actor.roles.includes('SPORTS_ADMIN')) return true;
    const sportIds = await this.findActiveSportIdsForFaculty(actor, executor);
    return sportIds.includes(sportId);
  }

  /** Authorized for a team iff currently authorized for that team's own sport —
   * never a per-team grant, matching the "scoped to sport(s)/team(s) they are
   * assigned to" rule from the workflow doc (a sport-level assignment implies
   * every team under it). */
  async isAuthorizedForTeam(
    actor: AuthenticatedUser,
    teamId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    if (actor.roles.includes('SPORTS_ADMIN')) return true;
    const { rows } = await executor.query<{ sport_id: string }>(
      `SELECT sport_id FROM team WHERE id = $1`,
      [teamId],
    );
    if (rows.length === 0) return false;
    return this.isAuthorizedForSport(actor, rows[0].sport_id, executor);
  }
}
