import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FeeHeadRow {
  id: string;
  name: string;
  code: string;
  headType: string;
  isRefundable: boolean;
  status: string;
  activeStructureCount: number;
  totalConfiguredPaise: string | null;
}

export interface CreateFeeHeadInput {
  name: string;
  code: string;
  headType: string;
  isRefundable?: boolean;
  status?: string;
}

export interface UpdateFeeHeadInput {
  name?: string;
  headType?: string;
  isRefundable?: boolean;
  status?: string;
}

const COLUMNS = `fh.id, fh.name, fh.code, fh.head_type AS "headType", fh.is_refundable AS "isRefundable", fh.status,
  count(DISTINCT fsl.fee_structure_id) FILTER (WHERE fs.state = 'ACTIVE')::int AS "activeStructureCount",
  sum(fsl.amount_paise) FILTER (WHERE fs.state = 'ACTIVE') AS "totalConfiguredPaise"`;

// A fee head is just a fee *type* (Tuition, Exam, ...) -- it has no amount of
// its own. What it's actually worth right now is the sum of every ACTIVE fee
// structure's line for that head, which is what "no amount mentioned" was
// really pointing at -- not a fabricated number, a real derived one.
const FROM = `fee_head fh
  LEFT JOIN fee_structure_line fsl ON fsl.fee_head_id = fh.id
  LEFT JOIN fee_structure fs ON fs.id = fsl.fee_structure_id AND fs.state = 'ACTIVE'`;
const GROUP_BY = `GROUP BY fh.id`;

@Injectable()
export class FeeHeadRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(executor: Queryable = this.postgres): Promise<FeeHeadRow[]> {
    const { rows } = await executor.query<FeeHeadRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${GROUP_BY} ORDER BY fh.name`,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<FeeHeadRow | null> {
    const { rows } = await executor.query<FeeHeadRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE fh.id = $1 ${GROUP_BY}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateFeeHeadInput,
    executor: Queryable = this.postgres,
  ): Promise<FeeHeadRow> {
    const { rows } = await executor.query<FeeHeadRow>(
      `INSERT INTO fee_head (name, code, head_type, is_refundable, status)
       VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, 'ACTIVE'))
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.code,
        input.headType,
        input.isRefundable ?? null,
        input.status ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateFeeHeadInput,
    executor: Queryable = this.postgres,
  ): Promise<FeeHeadRow | null> {
    const { rows } = await executor.query<FeeHeadRow>(
      `UPDATE fee_head SET
         name = COALESCE($2, name),
         head_type = COALESCE($3, head_type),
         is_refundable = COALESCE($4, is_refundable),
         status = COALESCE($5, status)
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.headType ?? null,
        input.isRefundable ?? null,
        input.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }
}
