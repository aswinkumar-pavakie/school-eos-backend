import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface HostelBedRow {
  id: string;
  roomId: string;
  bedNo: string;
  status: string;
}

export interface CreateHostelBedInput {
  bedNo: string;
  status?: string;
}

export interface UpdateHostelBedInput {
  bedNo?: string;
  status?: string;
}

const COLUMNS = `id, room_id AS "roomId", bed_no AS "bedNo", status`;

@Injectable()
export class HostelBedRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByRoomId(
    roomId: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelBedRow[]> {
    const { rows } = await executor.query<HostelBedRow>(
      `SELECT ${COLUMNS} FROM hostel_bed WHERE room_id = $1 ORDER BY bed_no`,
      [roomId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<HostelBedRow | null> {
    const { rows } = await executor.query<HostelBedRow>(
      `SELECT ${COLUMNS} FROM hostel_bed WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Row-locking read, for use inside a transaction right before a status flip that
   * must not race with a concurrent allocation of the same bed. */
  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<HostelBedRow | null> {
    const { rows } = await executor.query<HostelBedRow>(
      `SELECT ${COLUMNS} FROM hostel_bed WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    roomId: string,
    input: CreateHostelBedInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelBedRow> {
    const { rows } = await executor.query<HostelBedRow>(
      `INSERT INTO hostel_bed (room_id, bed_no, status)
       VALUES ($1, $2, COALESCE($3, 'VACANT'))
       RETURNING ${COLUMNS}`,
      [roomId, input.bedNo, input.status ?? null],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateHostelBedInput,
    executor: Queryable = this.postgres,
  ): Promise<HostelBedRow | null> {
    const { rows } = await executor.query<HostelBedRow>(
      `UPDATE hostel_bed SET bed_no = COALESCE($2, bed_no), status = COALESCE($3, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, input.bedNo ?? null, input.status ?? null],
    );
    return rows[0] ?? null;
  }

  async setStatus(
    id: string,
    status: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(`UPDATE hostel_bed SET status = $2 WHERE id = $1`, [
      id,
      status,
    ]);
  }

  /** Walks bed -> room -> floor -> block -> hostel to find which hostel (and its
   * gender) a bed belongs to -- for the allocation gender-match rule. */
  async findHostelGenderForBed(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ gender: string }>(
      `SELECT h.gender
       FROM hostel_bed bed
       JOIN hostel_room r ON r.id = bed.room_id
       JOIN hostel_floor f ON f.id = r.floor_id
       JOIN hostel_block bl ON bl.id = f.block_id
       JOIN hostel h ON h.id = bl.hostel_id
       WHERE bed.id = $1`,
      [id],
    );
    return rows[0]?.gender ?? null;
  }
}
