import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CommunityProposalRow {
  id: string;
  communityId: string;
  communityName: string;
  requestedBy: string;
  title: string;
  description: string;
  status: string;
  approvalRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommunityProposalInput {
  communityId: string;
  requestedBy: string;
  title: string;
  description: string;
}

const COLUMNS = `cp.id, cp.community_id AS "communityId", c.name AS "communityName",
  cp.requested_by AS "requestedBy", cp.title, cp.description, cp.status,
  cp.approval_request_id AS "approvalRequestId",
  cp.created_at AS "createdAt", cp.updated_at AS "updatedAt"`;

const FROM = `community_proposal cp JOIN community c ON c.id = cp.community_id`;

@Injectable()
export class CommunityProposalRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityProposalRow[]> {
    const { rows } = await executor.query<CommunityProposalRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cp.community_id = $1 ORDER BY cp.created_at DESC`,
      [communityId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityProposalRow | null> {
    const { rows } = await executor.query<CommunityProposalRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE cp.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateCommunityProposalInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityProposalRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO community_proposal (community_id, requested_by, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.communityId, input.requestedBy, input.title, input.description],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE community_proposal SET approval_request_id = $2, updated_at = now() WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  /** Resubmission: revise title/description (if provided), reset status to
   * PENDING, and point at the fresh approval_request created for this
   * resubmission -- the old, SENT_BACK approval_request is left exactly as it
   * was, a real historical record of the reviewer's original decision. */
  async resubmit(
    id: string,
    input: { title?: string; description?: string; approvalRequestId: string },
    executor: Queryable = this.postgres,
  ): Promise<CommunityProposalRow> {
    await executor.query(
      `UPDATE community_proposal SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         status = 'PENDING',
         approval_request_id = $4,
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.approvalRequestId,
      ],
    );
    return (await this.findById(id, executor))!;
  }

  async setStatus(
    id: string,
    status: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE community_proposal SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
  }
}
