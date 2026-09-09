// student_id references `student` (Phase 2's People module) -- accepted as an opaque
// UUID, same cross-module-FK pattern used everywhere in this build. Joined here only
// for display (name), not validated against a student repository this module doesn't
// have; a bad reference surfaces as a clean foreign-key-violation 409.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CommunityMembershipRow {
  id: string;
  communityId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  roleInCommunity: string;
  parentConsentAt: Date | null;
  joinedOn: string;
  addedBy: string | null;
  status: string;
}

export interface CreateMembershipInput {
  communityId: string;
  studentId: string;
  roleInCommunity?: string;
  addedBy: string;
}

const COLUMNS = `m.id, m.community_id AS "communityId", m.student_id AS "studentId",
  p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  m.role_in_community AS "roleInCommunity", m.parent_consent_at AS "parentConsentAt",
  m.joined_on AS "joinedOn", m.added_by AS "addedBy", m.status`;

@Injectable()
export class CommunityMembershipRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityMembershipRow[]> {
    const { rows } = await executor.query<CommunityMembershipRow>(
      `SELECT ${COLUMNS} FROM community_membership m
       JOIN student s ON s.id = m.student_id
       JOIN person p ON p.id = s.person_id
       WHERE m.community_id = $1
       ORDER BY m.joined_on DESC`,
      [communityId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityMembershipRow | null> {
    const { rows } = await executor.query<CommunityMembershipRow>(
      `SELECT ${COLUMNS} FROM community_membership m
       JOIN student s ON s.id = m.student_id
       JOIN person p ON p.id = s.person_id
       WHERE m.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateMembershipInput,
    executor: Queryable = this.postgres,
  ): Promise<{ id: string }> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO community_membership (community_id, student_id, role_in_community, added_by)
       VALUES ($1, $2, COALESCE($3, 'MEMBER'), $4)
       RETURNING id`,
      [input.communityId, input.studentId, input.roleInCommunity ?? null, input.addedBy],
    );
    return rows[0];
  }

  /** Atomic with the caller's transaction: status -> ACTIVE and parent_consent_at ->
   * now() together, matching the membership_consent CHECK (status='ACTIVE' iff
   * parent_consent_at is set). */
  async recordConsent(id: string, executor: Queryable): Promise<{ id: string } | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE community_membership SET status = 'ACTIVE', parent_consent_at = now()
       WHERE id = $1 RETURNING id`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Atomic with the caller's transaction: status -> REMOVED and parent_consent_at
   * cleared back to null together -- keeps the row consistent with the same
   * consent-iff-ACTIVE modelling even though the DB constraint itself only requires
   * it while ACTIVE. */
  async remove(id: string, executor: Queryable): Promise<{ id: string } | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE community_membership SET status = 'REMOVED', parent_consent_at = NULL
       WHERE id = $1 RETURNING id`,
      [id],
    );
    return rows[0] ?? null;
  }
}
