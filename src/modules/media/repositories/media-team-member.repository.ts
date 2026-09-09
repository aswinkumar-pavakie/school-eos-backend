// media_team_member -- see database/migrations/0006_media_room.sql. Deliberately
// its own roster, not person + role_assignment: a shoot's crew commonly includes
// students or short-term help with no system login at all.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface MediaTeamMemberRow {
  id: string;
  personId: string | null;
  fullName: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaTeamMemberWithLoadRow extends MediaTeamMemberRow {
  activeJobs: number;
}

function mapRow(row: any): MediaTeamMemberRow {
  return {
    id: row.id,
    personId: row.person_id,
    fullName: row.full_name,
    designation: row.designation,
    email: row.email,
    phone: row.phone,
    skills: row.skills ?? [],
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class MediaTeamMemberRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** activeJobs = real count of shoot_assignment rows this member is crewed on that
   * are still PLANNED or IN_PROGRESS -- never a client-side reduce. */
  async listWithLoad(executor: Queryable = this.postgres): Promise<MediaTeamMemberWithLoadRow[]> {
    const { rows } = await executor.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM shoot_assignment_crew sac
          JOIN shoot_assignment sa ON sa.id = sac.shoot_assignment_id
          WHERE sac.media_team_member_id = m.id AND sa.status IN ('PLANNED','IN_PROGRESS'))::int AS active_jobs
       FROM media_team_member m
       ORDER BY m.full_name`,
    );
    return rows.map((r: any) => ({ ...mapRow(r), activeJobs: r.active_jobs }));
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<MediaTeamMemberRow | null> {
    const { rows } = await executor.query(`SELECT * FROM media_team_member WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async findManyByIds(ids: string[], executor: Queryable = this.postgres): Promise<MediaTeamMemberRow[]> {
    if (ids.length === 0) return [];
    const { rows } = await executor.query(`SELECT * FROM media_team_member WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map(mapRow);
  }

  async create(
    input: {
      personId?: string | null;
      fullName: string;
      designation?: string | null;
      email?: string | null;
      phone?: string | null;
      skills?: string[];
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<MediaTeamMemberRow> {
    const { rows } = await executor.query(
      `INSERT INTO media_team_member (person_id, full_name, designation, email, phone, skills, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.personId ?? null,
        input.fullName,
        input.designation ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.skills ?? [],
        input.createdBy,
      ],
    );
    return mapRow(rows[0]);
  }

  async update(
    id: string,
    input: {
      fullName?: string;
      designation?: string | null;
      email?: string | null;
      phone?: string | null;
      skills?: string[];
      status?: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<MediaTeamMemberRow | null> {
    const { rows } = await executor.query(
      `UPDATE media_team_member SET
         full_name = COALESCE($2, full_name),
         designation = COALESCE($3, designation),
         email = COALESCE($4, email),
         phone = COALESCE($5, phone),
         skills = COALESCE($6, skills),
         status = COALESCE($7, status),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, input.fullName ?? null, input.designation ?? null, input.email ?? null, input.phone ?? null, input.skills ?? null, input.status ?? null],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }
}
