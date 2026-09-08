import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface HostelFloorRow {
  id: string;
  blockId: string;
  floorNo: number;
}

export interface CreateHostelFloorInput {
  floorNo: number;
}

export interface UpdateHostelFloorInput {
  floorNo?: number;
}

const COLUMNS = `id, block_id AS "blockId", floor_no AS "floorNo"`;

@Injectable()
export class HostelFloorRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByBlockId(blockId: string, executor: Queryable = this.postgres): Promise<HostelFloorRow[]> {
    const { rows } = await executor.query<HostelFloorRow>(
      `SELECT ${COLUMNS} FROM hostel_floor WHERE block_id = $1 ORDER BY floor_no`,
      [blockId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<HostelFloorRow | null> {
    const { rows } = await executor.query<HostelFloorRow>(
      `SELECT ${COLUMNS} FROM hostel_floor WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    blockId: string,
    input: CreateHostelFloorInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelFloorRow> {
    const { rows } = await executor.query<HostelFloorRow>(
      `INSERT INTO hostel_floor (block_id, floor_no) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [blockId, input.floorNo],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHostelFloorInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelFloorRow | null> {
    const { rows } = await executor.query<HostelFloorRow>(
      `UPDATE hostel_floor SET floor_no = COALESCE($2, floor_no) WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, input.floorNo ?? null],
    );
    return rows[0] ?? null;
  }
}
