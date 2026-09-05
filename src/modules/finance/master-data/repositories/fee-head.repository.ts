// Master data backing fee_structure_line.fee_head_id — without this, the Fee
// Structure create form has no valid IDs to reference at all.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';

export interface FeeHeadRow {
  id: string;
  name: string;
  code: string;
  headType: string;
  isRefundable: boolean;
  status: string;
}

function mapRow(row: any): FeeHeadRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    headType: row.head_type,
    isRefundable: row.is_refundable,
    status: row.status,
  };
}

@Injectable()
export class FeeHeadRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(executor: Queryable = this.postgres): Promise<FeeHeadRow[]> {
    const { rows } = await executor.query(`SELECT * FROM fee_head ORDER BY name ASC`);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<FeeHeadRow | null> {
    const { rows } = await executor.query(`SELECT * FROM fee_head WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: { name: string; code: string; headType: string; isRefundable?: boolean },
    executor: Queryable = this.postgres,
  ): Promise<FeeHeadRow> {
    const { rows } = await executor.query(
      `INSERT INTO fee_head (name, code, head_type, is_refundable, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING *`,
      [input.name, input.code, input.headType, input.isRefundable ?? false],
    );
    return mapRow(rows[0]);
  }

  async setStatus(id: string, status: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`UPDATE fee_head SET status = $2 WHERE id = $1`, [id, status]);
  }

  async update(
    id: string,
    input: { name?: string; code?: string; headType?: string; isRefundable?: boolean },
    executor: Queryable = this.postgres,
  ): Promise<FeeHeadRow> {
    const { rows } = await executor.query(
      `UPDATE fee_head
       SET name = COALESCE($2, name),
           code = COALESCE($3, code),
           head_type = COALESCE($4, head_type),
           is_refundable = COALESCE($5, is_refundable)
       WHERE id = $1
       RETURNING *`,
      [id, input.name ?? null, input.code ?? null, input.headType ?? null, input.isRefundable ?? null],
    );
    return mapRow(rows[0]);
  }
}
