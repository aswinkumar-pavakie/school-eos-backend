import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CommunityInitiativeRow {
  id: string;
  communityId: string;
  communityName: string;
  proposalId: string;
  title: string;
  description: string;
  status: string;
  plannedDate: string | null;
  venue: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  progressNotes: string | null;
  outcome: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommunityInitiativeInput {
  communityId: string;
  proposalId: string;
  title: string;
  description: string;
  plannedDate?: string | null;
  venue?: string | null;
  createdBy: string;
}

export interface UpdateCommunityInitiativeInput {
  title?: string;
  description?: string;
  plannedDate?: string;
  venue?: string;
}

const COLUMNS = `ci.id, ci.community_id AS "communityId", c.name AS "communityName",
  ci.proposal_id AS "proposalId", ci.title, ci.description, ci.status,
  ci.planned_date AS "plannedDate", ci.venue, ci.started_at AS "startedAt", ci.completed_at AS "completedAt",
  ci.progress_notes AS "progressNotes", ci.outcome,
  ci.created_by AS "createdBy", ci.created_at AS "createdAt", ci.updated_at AS "updatedAt"`;

const FROM = `community_initiative ci JOIN community c ON c.id = ci.community_id`;

@Injectable()
export class CommunityInitiativeRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow[]> {
    const { rows } = await executor.query<CommunityInitiativeRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE ci.community_id = $1 ORDER BY ci.created_at DESC`,
      [communityId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow | null> {
    const { rows } = await executor.query<CommunityInitiativeRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE ci.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByProposalId(
    proposalId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow | null> {
    const { rows } = await executor.query<CommunityInitiativeRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE ci.proposal_id = $1`,
      [proposalId],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateCommunityInitiativeInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO community_initiative (community_id, proposal_id, title, description, planned_date, venue, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.communityId,
        input.proposalId,
        input.title,
        input.description,
        input.plannedDate ?? null,
        input.venue ?? null,
        input.createdBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  /** PLANNED-only, enforced by the service, not here -- this method just
   * writes whatever fields are given. */
  async update(
    id: string,
    input: UpdateCommunityInitiativeInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE community_initiative SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         planned_date = COALESCE($4, planned_date),
         venue = COALESCE($5, venue),
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.plannedDate ?? null,
        input.venue ?? null,
      ],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }

  async start(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE community_initiative SET status = 'IN_PROGRESS', started_at = now(), updated_at = now()
       WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }

  async complete(
    id: string,
    outcome: string | null,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE community_initiative SET status = 'COMPLETED', completed_at = now(), outcome = $2, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [id, outcome],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }

  async updateProgress(
    id: string,
    progressNotes: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityInitiativeRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE community_initiative SET progress_notes = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, progressNotes],
    );
    if (!rows[0]) return null;
    return this.findById(id, executor);
  }
}
