import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelRoomRow {
  id: string;
  floorId: string;
  roomNo: string;
  roomType: string | null;
  bedCapacity: number;
  status: string;
}

export interface CreateHostelRoomInput {
  roomNo: string;
  roomType?: string | null;
  bedCapacity: number;
  status?: string;
}

export interface UpdateHostelRoomInput {
  roomNo?: string;
  roomType?: string | null;
  bedCapacity?: number;
  status?: string;
}

const COLUMNS = `id, floor_id AS "floorId", room_no AS "roomNo", room_type AS "roomType",
  bed_capacity AS "bedCapacity", status`;

@Injectable()
export class HostelRoomRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByFloorId(
    floorId: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelRoomRow[]> {
    const { rows } = await executor.query<HostelRoomRow>(
      `SELECT ${COLUMNS} FROM hostel_room WHERE floor_id = $1 ORDER BY room_no`,
      [floorId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelRoomRow | null> {
    const { rows } = await executor.query<HostelRoomRow>(
      `SELECT ${COLUMNS} FROM hostel_room WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    floorId: string,
    input: CreateHostelRoomInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelRoomRow> {
    const { rows } = await executor.query<HostelRoomRow>(
      `INSERT INTO hostel_room (floor_id, room_no, room_type, bed_capacity, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        floorId,
        input.roomNo,
        input.roomType ?? null,
        input.bedCapacity,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHostelRoomInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelRoomRow | null> {
    const { rows } = await executor.query<HostelRoomRow>(
      `UPDATE hostel_room SET
         room_no = COALESCE($2, room_no),
         room_type = COALESCE($3, room_type),
         bed_capacity = COALESCE($4, bed_capacity),
         status = COALESCE($5, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.roomNo ?? null,
        input.roomType ?? null,
        input.bedCapacity ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
