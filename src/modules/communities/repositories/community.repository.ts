// incharge_staff_id references `staff`, a table this module doesn't own (Phase 2
// owns it). Accepted here as an opaque optional UUID -- an invalid reference
// surfaces as a foreign key violation (23503), translated to a clean 409 by the
// service layer, not validated against a staff repository this module doesn't have.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CommunityRow {
  id: string;
  name: string;
  communityCategory: string;
  description: string | null;
  inchargeStaffId: string | null;
  academicYearId: string;
  maxMembers: number | null;
  discussionEnabled: boolean;
  moderationMode: string;
  state: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityListFilter {
  academicYearId?: string;
  state?: string;
}

export interface CreateCommunityInput {
  name: string;
  communityCategory: string;
  description?: string | null;
  inchargeStaffId?: string | null;
  academicYearId: string;
  maxMembers?: number | null;
  discussionEnabled?: boolean;
  moderationMode?: string;
  createdBy: string;
}

export interface UpdateCommunityInput {
  name?: string;
  communityCategory?: string;
  description?: string | null;
  inchargeStaffId?: string | null;
  maxMembers?: number | null;
  discussionEnabled?: boolean;
  moderationMode?: string;
}

const COLUMNS = `id, name, community_category AS "communityCategory", description,
  incharge_staff_id AS "inchargeStaffId", academic_year_id AS "academicYearId",
  max_members AS "maxMembers", discussion_enabled AS "discussionEnabled",
  moderation_mode AS "moderationMode", state, created_by AS "createdBy",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class CommunityRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: CommunityListFilter,
    executor: Queryable = this.postgres,
  ): Promise<CommunityRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`academic_year_id = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`state = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<CommunityRow>(
      `SELECT ${COLUMNS} FROM community ${where} ORDER BY name`,
      params,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityRow | null> {
    const { rows } = await executor.query<CommunityRow>(
      `SELECT ${COLUMNS} FROM community WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateCommunityInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityRow> {
    const { rows } = await executor.query<CommunityRow>(
      `INSERT INTO community
         (name, community_category, description, incharge_staff_id, academic_year_id,
          max_members, discussion_enabled, moderation_mode, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), COALESCE($8, 'PRE_MODERATED'), $9)
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.communityCategory,
        input.description ?? null,
        input.inchargeStaffId ?? null,
        input.academicYearId,
        input.maxMembers ?? null,
        input.discussionEnabled ?? null,
        input.moderationMode ?? null,
        input.createdBy,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateCommunityInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityRow | null> {
    const { rows } = await executor.query<CommunityRow>(
      `UPDATE community SET
         name = COALESCE($2, name),
         community_category = COALESCE($3, community_category),
         description = COALESCE($4, description),
         incharge_staff_id = COALESCE($5, incharge_staff_id),
         max_members = COALESCE($6, max_members),
         discussion_enabled = COALESCE($7, discussion_enabled),
         moderation_mode = COALESCE($8, moderation_mode),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.communityCategory ?? null,
        input.description ?? null,
        input.inchargeStaffId ?? null,
        input.maxMembers ?? null,
        input.discussionEnabled ?? null,
        input.moderationMode ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityRow | null> {
    const { rows } = await executor.query<CommunityRow>(
      `UPDATE community SET state = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, state],
    );
    return rows[0] ?? null;
  }
}
