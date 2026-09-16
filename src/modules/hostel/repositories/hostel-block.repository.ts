import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelBlockRow {
  id: string;
  hostelId: string;
  name: string;
}

export interface CreateHostelBlockInput {
  name: string;
}

export interface UpdateHostelBlockInput {
  name?: string;
}

// Backs Principal/Vice Principal/Admin's real "Blocks & wardens" oversight card
// (design-reframe addition) -- one aggregate query across the real
// block -> floor -> room -> bed -> allocation chain, rather than the N+1
// traversal PrincipalHostelHierarchy.tsx does client-side for the expandable
// tree view. Warden name comes from hostel.warden_staff_id (the real, live
// legacy FK already populated on every seeded hostel row) -- NOT from
// role_assignment, since no ACTIVE HOSTEL_WARDEN role_assignment rows exist
// in the real data yet (checked live), only the legacy FK does. Warden is
// therefore per-HOSTEL, not per-block (the real schema has no block-level
// warden) -- every block under a hostel shows that hostel's one warden,
// which is honestly what the data supports.
export interface HostelBlockOversightRow {
  id: string;
  name: string;
  hostelId: string;
  hostelName: string;
  roomCount: number;
  capacity: number;
  occupied: number;
  wardenFirstName: string | null;
  wardenLastName: string | null;
}

const COLUMNS = `id, hostel_id AS "hostelId", name`;

@Injectable()
export class HostelBlockRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByHostelId(
    hostelId: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow[]> {
    const { rows } = await executor.query<HostelBlockRow>(
      `SELECT ${COLUMNS} FROM hostel_block WHERE hostel_id = $1 ORDER BY name`,
      [hostelId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow | null> {
    const { rows } = await executor.query<HostelBlockRow>(
      `SELECT ${COLUMNS} FROM hostel_block WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    hostelId: string,
    input: CreateHostelBlockInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow> {
    const { rows } = await executor.query<HostelBlockRow>(
      `INSERT INTO hostel_block (hostel_id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [hostelId, input.name],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHostelBlockInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockRow | null> {
    const { rows } = await executor.query<HostelBlockRow>(
      `UPDATE hostel_block SET name = COALESCE($2, name) WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, input.name ?? null],
    );
    return rows[0] ?? null;
  }

  async findOversight(
    executor: Queryable = this.postgres,
  ): Promise<HostelBlockOversightRow[]> {
    const { rows } = await executor.query<HostelBlockOversightRow>(
      `SELECT bl.id, bl.name, h.id AS "hostelId", h.name AS "hostelName",
        COUNT(DISTINCT r.id)::int AS "roomCount",
        COUNT(b.id)::int AS capacity,
        COUNT(a.id) FILTER (WHERE a.id IS NOT NULL)::int AS occupied,
        wp.first_name AS "wardenFirstName", wp.last_name AS "wardenLastName"
       FROM hostel_block bl
       JOIN hostel h ON h.id = bl.hostel_id
       LEFT JOIN hostel_floor f ON f.block_id = bl.id
       LEFT JOIN hostel_room r ON r.floor_id = f.id
       LEFT JOIN hostel_bed b ON b.room_id = r.id
       LEFT JOIN hostel_allocation a ON a.bed_id = b.id AND a.status = 'ACTIVE'
       LEFT JOIN staff ws ON ws.id = h.warden_staff_id
       LEFT JOIN person wp ON wp.id = ws.person_id
       GROUP BY bl.id, bl.name, h.id, h.name, wp.first_name, wp.last_name
       ORDER BY h.name, bl.name`,
    );
    return rows;
  }
}
