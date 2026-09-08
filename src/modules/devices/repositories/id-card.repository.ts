import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface IdCardRow {
  id: string;
  cardUid: string;
  cardTech: string;
  holderType: string;
  studentId: string | null;
  staffId: string | null;
  holderFirstName: string | null;
  holderLastName: string | null;
  issuedOn: string;
  issuedBy: string | null;
  printBatch: string | null;
  replacesCardId: string | null;
  blockedAt: Date | null;
  blockedBy: string | null;
  blockedReason: string | null;
  status: string;
}

export interface CreateIdCardInput {
  cardUid: string;
  cardTech?: string;
  holderType: string;
  studentId?: string | null;
  staffId?: string | null;
  issuedOn?: string;
  issuedBy?: string | null;
  printBatch?: string | null;
  replacesCardId?: string | null;
}

export interface IdCardFilter {
  studentId?: string;
  staffId?: string;
  status?: string;
}

const COLUMNS = `c.id, c.card_uid AS "cardUid", c.card_tech AS "cardTech", c.holder_type AS "holderType",
  c.student_id AS "studentId", c.staff_id AS "staffId",
  COALESCE(sp.first_name, tp.first_name) AS "holderFirstName",
  COALESCE(sp.last_name, tp.last_name) AS "holderLastName",
  c.issued_on AS "issuedOn", c.issued_by AS "issuedBy", c.print_batch AS "printBatch",
  c.replaces_card_id AS "replacesCardId", c.blocked_at AS "blockedAt", c.blocked_by AS "blockedBy",
  c.blocked_reason AS "blockedReason", c.status`;

const FROM = `id_card c
  LEFT JOIN student st ON st.id = c.student_id
  LEFT JOIN person sp ON sp.id = st.person_id
  LEFT JOIN staff sf ON sf.id = c.staff_id
  LEFT JOIN person tp ON tp.id = sf.person_id`;

@Injectable()
export class IdCardRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: IdCardFilter,
    executor: Queryable = this.postgres,
  ): Promise<IdCardRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`c.student_id = $${params.length}`);
    }
    if (filter.staffId) {
      params.push(filter.staffId);
      conditions.push(`c.staff_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`c.status = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<IdCardRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where} ORDER BY c.created_at DESC`,
      params,
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<IdCardRow | null> {
    const { rows } = await executor.query<IdCardRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE c.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<{
    status: string;
    holderType: string;
    studentId: string | null;
    staffId: string | null;
  } | null> {
    const { rows } = await executor.query<{
      status: string;
      holderType: string;
      studentId: string | null;
      staffId: string | null;
    }>(
      `SELECT status, holder_type AS "holderType", student_id AS "studentId", staff_id AS "staffId"
       FROM id_card WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findActiveByHolder(
    holderType: string,
    holderId: string,
    executor: Queryable = this.postgres,
  ): Promise<IdCardRow | null> {
    const column = holderType === 'STUDENT' ? 'c.student_id' : 'c.staff_id';
    const { rows } = await executor.query<IdCardRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE ${column} = $1 AND c.status = 'ACTIVE'`,
      [holderId],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateIdCardInput,
    executor: Queryable = this.postgres,
  ): Promise<IdCardRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO id_card
         (card_uid, card_tech, holder_type, student_id, staff_id, issued_on, issued_by,
          print_batch, replaces_card_id)
       VALUES ($1, COALESCE($2, 'DESFIRE_EV2'), $3, $4, $5, COALESCE($6, CURRENT_DATE), $7, $8, $9)
       RETURNING id`,
      [
        input.cardUid,
        input.cardTech ?? null,
        input.holderType,
        input.studentId ?? null,
        input.staffId ?? null,
        input.issuedOn ?? null,
        input.issuedBy ?? null,
        input.printBatch ?? null,
        input.replacesCardId ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async block(
    id: string,
    status: string,
    blockedBy: string | null,
    blockedReason: string,
    executor: Queryable = this.postgres,
  ): Promise<IdCardRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE id_card SET status = $2, blocked_at = now(), blocked_by = $3, blocked_reason = $4, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id, status, blockedBy, blockedReason],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  /** Used by reissue to flip the superseded card to REPLACED. Must also clear
   * blocked_at/blocked_by/blocked_reason when moving out of the LOST/DAMAGED/BLOCKED
   * family, or the `card_blocked_ts` CHECK (status IN (...) = (blocked_at IS NOT
   * NULL)) rejects the update for a card that was blocked before being reissued. */
  async markReplaced(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE id_card
       SET status = 'REPLACED', blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL, updated_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  /** A card found again after being blocked (not lost/damaged -- the physical card
   * itself is still fine) goes back to ACTIVE. Must clear blocked_at/blocked_by/
   * blocked_reason together, or the `card_blocked_ts` CHECK (status IN (LOST,
   * DAMAGED, BLOCKED) = (blocked_at IS NOT NULL)) rejects the update. */
  async unblock(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<IdCardRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE id_card
       SET status = 'ACTIVE', blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}
