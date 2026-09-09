// shoot_assignment + its crew/gear join tables -- see database/migrations/0006_media_room.sql.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CrewMemberSummary {
  id: string;
  fullName: string;
  designation: string | null;
}

export interface GearItemSummary {
  id: string;
  name: string;
  assetCode: string | null;
}

export interface ShootAssignmentRow {
  id: string;
  eventTitle: string;
  venue: string | null;
  scheduledAt: Date;
  outputType: string;
  status: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  crew: CrewMemberSummary[];
  gear: GearItemSummary[];
}

function mapRow(row: any): Omit<ShootAssignmentRow, 'crew' | 'gear'> {
  return {
    id: row.id,
    eventTitle: row.event_title,
    venue: row.venue,
    scheduledAt: row.scheduled_at,
    outputType: row.output_type,
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CREW_SUBQUERY = `
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', mtm.id, 'fullName', mtm.full_name, 'designation', mtm.designation) ORDER BY mtm.full_name)
    FROM shoot_assignment_crew sac JOIN media_team_member mtm ON mtm.id = sac.media_team_member_id
    WHERE sac.shoot_assignment_id = sa.id
  ), '[]'::jsonb) AS crew
`;

const GEAR_SUBQUERY = `
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ii.id, 'name', ii.name, 'assetCode', ii.asset_code) ORDER BY ii.name)
    FROM shoot_assignment_gear sag JOIN inventory_item ii ON ii.id = sag.inventory_item_id
    WHERE sag.shoot_assignment_id = sa.id
  ), '[]'::jsonb) AS gear
`;

@Injectable()
export class ShootAssignmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(
    filter: { status?: string; from?: string; to?: string },
    executor: Queryable = this.postgres,
  ): Promise<ShootAssignmentRow[]> {
    const { rows } = await executor.query(
      `SELECT sa.*, ${CREW_SUBQUERY}, ${GEAR_SUBQUERY}
       FROM shoot_assignment sa
       WHERE ($1::text IS NULL OR sa.status = $1)
         AND ($2::date IS NULL OR sa.scheduled_at::date >= $2)
         AND ($3::date IS NULL OR sa.scheduled_at::date <= $3)
       ORDER BY sa.scheduled_at ASC`,
      [filter.status ?? null, filter.from ?? null, filter.to ?? null],
    );
    return rows.map((r: any) => ({ ...mapRow(r), crew: r.crew, gear: r.gear }));
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<ShootAssignmentRow | null> {
    const { rows } = await executor.query(
      `SELECT sa.*, ${CREW_SUBQUERY}, ${GEAR_SUBQUERY} FROM shoot_assignment sa WHERE sa.id = $1`,
      [id],
    );
    if (!rows.length) return null;
    return { ...mapRow(rows[0]), crew: rows[0].crew, gear: rows[0].gear };
  }

  async create(
    input: {
      eventTitle: string;
      venue?: string | null;
      scheduledAt: string;
      outputType: string;
      notes?: string | null;
      createdBy: string;
      crewIds: string[];
      gearIds: string[];
    },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO shoot_assignment (event_title, venue, scheduled_at, output_type, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.eventTitle,
        input.venue ?? null,
        input.scheduledAt,
        input.outputType,
        input.notes ?? null,
        input.createdBy,
      ],
    );
    const id = rows[0].id as string;
    for (const memberId of input.crewIds) {
      await executor.query(
        `INSERT INTO shoot_assignment_crew (shoot_assignment_id, media_team_member_id) VALUES ($1, $2)`,
        [id, memberId],
      );
    }
    for (const itemId of input.gearIds) {
      await executor.query(
        `INSERT INTO shoot_assignment_gear (shoot_assignment_id, inventory_item_id) VALUES ($1, $2)`,
        [id, itemId],
      );
    }
    return id;
  }

  async update(
    id: string,
    input: {
      eventTitle?: string;
      venue?: string | null;
      scheduledAt?: string;
      outputType?: string;
      status?: string;
      notes?: string | null;
      crewIds?: string[];
      gearIds?: string[];
    },
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE shoot_assignment SET
         event_title = COALESCE($2, event_title),
         venue = COALESCE($3, venue),
         scheduled_at = COALESCE($4, scheduled_at),
         output_type = COALESCE($5, output_type),
         status = COALESCE($6, status),
         notes = COALESCE($7, notes),
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.eventTitle ?? null,
        input.venue ?? null,
        input.scheduledAt ?? null,
        input.outputType ?? null,
        input.status ?? null,
        input.notes ?? null,
      ],
    );
    if (input.crewIds) {
      await executor.query(
        `DELETE FROM shoot_assignment_crew WHERE shoot_assignment_id = $1`,
        [id],
      );
      for (const memberId of input.crewIds) {
        await executor.query(
          `INSERT INTO shoot_assignment_crew (shoot_assignment_id, media_team_member_id) VALUES ($1, $2)`,
          [id, memberId],
        );
      }
    }
    if (input.gearIds) {
      await executor.query(
        `DELETE FROM shoot_assignment_gear WHERE shoot_assignment_id = $1`,
        [id],
      );
      for (const itemId of input.gearIds) {
        await executor.query(
          `INSERT INTO shoot_assignment_gear (shoot_assignment_id, inventory_item_id) VALUES ($1, $2)`,
          [id, itemId],
        );
      }
    }
  }

  async countToday(executor: Queryable = this.postgres): Promise<number> {
    const { rows } = await executor.query(
      `SELECT COUNT(*)::int AS count FROM shoot_assignment WHERE scheduled_at::date = CURRENT_DATE AND status <> 'CANCELLED'`,
    );
    return rows[0].count;
  }
}
