import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AudienceRow {
  audienceType: string;
  targetId: string | null;
  targetStage: string | null;
  targetRole: string | null;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: string | null;
  priority: string;
  isEmergency: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
  createdBy: string;
  approvedBy: string | null;
  state: string;
  createdAt: Date;
  audiences: AudienceRow[];
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  category?: string | null;
  priority: string;
  isEmergency?: boolean;
  expiresAt?: string | null;
  createdBy: string;
  audiences: AudienceRow[];
}

export interface AnnouncementFilter {
  /** A real, active role_code -- matches announcements sent to the whole school
   * (audience_type='SCHOOL') OR specifically targeted at this role. */
  roleCode?: string;
  /** Matches SCHOOL-wide announcements plus any SECTION-targeted announcement
   * whose target_id is one of these sections -- the Faculty "my announcements"
   * feed's own scoping (their advisor + teaching sections). Combines with
   * `roleCode` via OR when both are given. */
  sectionIds?: string[];
  /** Restrict to announcements this actor created (Faculty CRUD ownership). */
  createdBy?: string;
  includeArchived?: boolean;
}

const COLUMNS = `a.id, a.title, a.body, a.category, a.priority, a.is_emergency AS "isEmergency",
  a.publish_at AS "publishAt", a.expires_at AS "expiresAt",
  a.created_by AS "createdBy", a.approved_by AS "approvedBy", a.state, a.created_at AS "createdAt"`;

@Injectable()
export class AnnouncementRepository {
  constructor(private readonly postgres: PostgresService) {}

  private async attachAudiences(
    rows: Omit<AnnouncementRow, 'audiences'>[],
    executor: Queryable,
  ) {
    if (rows.length === 0) return [] as AnnouncementRow[];
    const { rows: audienceRows } = await executor.query<
      AudienceRow & { announcementId: string }
    >(
      `SELECT announcement_id AS "announcementId", audience_type AS "audienceType",
              target_id AS "targetId", target_stage AS "targetStage", target_role AS "targetRole"
       FROM announcement_audience
       WHERE announcement_id = ANY($1)`,
      [rows.map((r) => r.id)],
    );
    return rows.map((r) => ({
      ...r,
      audiences: audienceRows
        .filter((a) => a.announcementId === r.id)
        .map(({ announcementId: _a, ...rest }) => rest),
    }));
  }

  async findMany(
    filter: AnnouncementFilter,
    executor: Queryable = this.postgres,
  ): Promise<AnnouncementRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filter.includeArchived) {
      conditions.push(`a.state NOT IN ('ARCHIVED', 'CANCELLED')`);
    }
    if (
      filter.roleCode ||
      (filter.sectionIds && filter.sectionIds.length > 0)
    ) {
      const audienceOrs: string[] = [`aud.audience_type = 'SCHOOL'`];
      if (filter.roleCode) {
        params.push(filter.roleCode);
        audienceOrs.push(
          `(aud.audience_type = 'ROLE' AND aud.target_role = $${params.length})`,
        );
      }
      if (filter.sectionIds && filter.sectionIds.length > 0) {
        params.push(filter.sectionIds);
        audienceOrs.push(
          `(aud.audience_type = 'SECTION' AND aud.target_id = ANY($${params.length}))`,
        );
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM announcement_audience aud WHERE aud.announcement_id = a.id AND (${audienceOrs.join(' OR ')}))`,
      );
    }
    if (filter.createdBy) {
      params.push(filter.createdBy);
      conditions.push(`a.created_by = $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<Omit<AnnouncementRow, 'audiences'>>(
      `SELECT ${COLUMNS} FROM announcement a ${where} ORDER BY a.created_at DESC`,
      params,
    );
    return this.attachAudiences(rows, executor);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<AnnouncementRow | null> {
    const { rows } = await executor.query<Omit<AnnouncementRow, 'audiences'>>(
      `SELECT ${COLUMNS} FROM announcement a WHERE a.id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const [withAudiences] = await this.attachAudiences(rows, executor);
    return withAudiences;
  }

  async create(
    input: CreateAnnouncementInput,
    executor: Queryable = this.postgres,
  ): Promise<AnnouncementRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO announcement (title, body, category, priority, is_emergency, publish_at, expires_at, created_by, approved_by, state)
       VALUES ($1, $2, $3, $4, COALESCE($5, false), now(), $6, $7, $7, 'PUBLISHED')
       RETURNING id`,
      [
        input.title,
        input.body,
        input.category ?? null,
        input.priority,
        input.isEmergency ?? null,
        input.expiresAt ?? null,
        input.createdBy,
      ],
    );
    const id = rows[0].id;

    for (const audience of input.audiences) {
      await executor.query(
        `INSERT INTO announcement_audience (announcement_id, audience_type, target_id, target_stage, target_role)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          audience.audienceType,
          audience.targetId ?? null,
          audience.targetStage ?? null,
          audience.targetRole ?? null,
        ],
      );
    }

    return (await this.findById(id, executor))!;
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable = this.postgres,
  ): Promise<AnnouncementRow | null> {
    const { rows } = await executor.query(
      `UPDATE announcement SET state = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, state],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  /** Partial field update -- only columns present on `input` are touched.
   * Passing `audiences` replaces the announcement's whole audience set
   * (simplest correct semantics for "edit this announcement's targeting"). */
  async update(
    id: string,
    input: Partial<Omit<CreateAnnouncementInput, 'createdBy'>>,
    executor: Queryable = this.postgres,
  ): Promise<AnnouncementRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (input.title !== undefined) push('title', input.title);
    if (input.body !== undefined) push('body', input.body);
    if (input.category !== undefined) push('category', input.category);
    if (input.priority !== undefined) push('priority', input.priority);
    if (input.isEmergency !== undefined)
      push('is_emergency', input.isEmergency);
    if (input.expiresAt !== undefined) push('expires_at', input.expiresAt);

    if (sets.length > 0) {
      params.push(id);
      await executor.query(
        `UPDATE announcement SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
        params,
      );
    }

    if (input.audiences) {
      await executor.query(
        `DELETE FROM announcement_audience WHERE announcement_id = $1`,
        [id],
      );
      for (const audience of input.audiences) {
        await executor.query(
          `INSERT INTO announcement_audience (announcement_id, audience_type, target_id, target_stage, target_role)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            id,
            audience.audienceType,
            audience.targetId ?? null,
            audience.targetStage ?? null,
            audience.targetRole ?? null,
          ],
        );
      }
    }

    return this.findById(id, executor);
  }

  /** Hard delete -- children first (no assumption of ON DELETE CASCADE). */
  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `DELETE FROM announcement_read WHERE announcement_id = $1`,
      [id],
    );
    await executor.query(
      `DELETE FROM announcement_audience WHERE announcement_id = $1`,
      [id],
    );
    await executor.query(`DELETE FROM announcement WHERE id = $1`, [id]);
  }
}
