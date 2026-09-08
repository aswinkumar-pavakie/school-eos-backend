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
    if (filter.roleCode) {
      params.push(filter.roleCode);
      conditions.push(
        `EXISTS (SELECT 1 FROM announcement_audience aud WHERE aud.announcement_id = a.id
                 AND (aud.audience_type = 'SCHOOL' OR (aud.audience_type = 'ROLE' AND aud.target_role = $${params.length})))`,
      );
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
}
