import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CommunityMembershipRequestRow {
  id: string;
  communityId: string;
  action: 'ADD' | 'REMOVE';
  studentId: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  membershipId: string | null;
  roleInCommunity: string | null;
  status: string;
  approvalRequestId: string | null;
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddRequestInput {
  communityId: string;
  studentId: string;
  roleInCommunity?: string;
  requestedBy: string;
}

export interface CreateRemoveRequestInput {
  communityId: string;
  membershipId: string;
  requestedBy: string;
}

// student is LEFT JOINed -- for a REMOVE request student_id is NULL on this
// row itself (the student is reachable via membership_id -> community_membership
// -> student instead), so the name columns come from whichever side actually
// has a student for this request.
const COLUMNS = `cmr.id, cmr.community_id AS "communityId", cmr.action,
  cmr.student_id AS "studentId",
  COALESCE(p1.first_name, p2.first_name) AS "studentFirstName",
  COALESCE(p1.last_name, p2.last_name) AS "studentLastName",
  cmr.membership_id AS "membershipId", cmr.role_in_community AS "roleInCommunity",
  cmr.status, cmr.approval_request_id AS "approvalRequestId",
  cmr.requested_by AS "requestedBy", cmr.created_at AS "createdAt", cmr.updated_at AS "updatedAt"`;

const FROM = `community_membership_request cmr
  LEFT JOIN student s1 ON s1.id = cmr.student_id
  LEFT JOIN person p1 ON p1.id = s1.person_id
  LEFT JOIN community_membership cm ON cm.id = cmr.membership_id
  LEFT JOIN student s2 ON s2.id = cm.student_id
  LEFT JOIN person p2 ON p2.id = s2.person_id`;

@Injectable()
export class CommunityMembershipRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityMembershipRequestRow[]> {
    const { rows } = await executor.query<CommunityMembershipRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cmr.community_id = $1 ORDER BY cmr.created_at DESC`,
      [communityId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityMembershipRequestRow | null> {
    const { rows } = await executor.query<CommunityMembershipRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cmr.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async createAdd(
    input: CreateAddRequestInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityMembershipRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO community_membership_request
         (community_id, action, student_id, role_in_community, requested_by)
       VALUES ($1, 'ADD', $2, $3, $4)
       RETURNING id`,
      [
        input.communityId,
        input.studentId,
        input.roleInCommunity ?? null,
        input.requestedBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async createRemove(
    input: CreateRemoveRequestInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityMembershipRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO community_membership_request
         (community_id, action, membership_id, requested_by)
       VALUES ($1, 'REMOVE', $2, $3)
       RETURNING id`,
      [input.communityId, input.membershipId, input.requestedBy],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE community_membership_request SET approval_request_id = $2, updated_at = now() WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async setStatus(
    id: string,
    status: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE community_membership_request SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
  }
}
