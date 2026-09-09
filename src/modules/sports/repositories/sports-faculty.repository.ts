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

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class SportsFacultyRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every sport.id this person currently holds an ACTIVE SPORTS_FACULTY
   * assignment for. */
  async findActiveSportIdsForFaculty(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query<{ sport_id: string }>(
      `SELECT DISTINCT ra.scope_id AS sport_id
       FROM role_assignment ra
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       WHERE ra.role_code = 'SPORTS_FACULTY' AND ra.scope_type = 'SPORT'
         AND ra.person_id = $1 AND ra.status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((r) => r.sport_id);
  }

  async isAuthorizedForSport(
    personId: string,
    sportId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const sportIds = await this.findActiveSportIdsForFaculty(
      personId,
      executor,
    );
    return sportIds.includes(sportId);
  }

  /** Authorized for a team iff currently authorized for that team's own sport —
   * never a per-team grant, matching the "scoped to sport(s)/team(s) they are
   * assigned to" rule from the workflow doc (a sport-level assignment implies
   * every team under it). */
  async isAuthorizedForTeam(
    personId: string,
    teamId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query<{ sport_id: string }>(
      `SELECT sport_id FROM team WHERE id = $1`,
      [teamId],
    );
    if (rows.length === 0) return false;
    return this.isAuthorizedForSport(personId, rows[0].sport_id, executor);
  }
}
