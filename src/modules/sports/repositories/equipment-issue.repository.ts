// equipment_issue already exists live (see equipment.repository.ts's sibling
// table). Three columns used here — issue_reason, signature_object_key,
// signed_at — do NOT exist yet; this repository is written exactly as it will
// run once query.md's additive ALTER TABLE has been applied (same convention
// as permission-activity.repository.ts documents for a not-yet-created table).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface EquipmentIssueRow {
  id: string;
  equipmentId: string;
  equipmentName: string;
  issuedToStudentId: string | null;
  issuedToTeamId: string | null;
  quantity: number;
  issuedOn: string;
  dueOn: string | null;
  returnedOn: string | null;
  conditionOnReturn: string | null;
  issueReason: string | null;
  signatureObjectKey: string | null;
  signedAt: Date | null;
  issuedBy: string | null;
}

const COLUMNS = `ei.id, ei.equipment_id AS "equipmentId", eq.name AS "equipmentName",
  ei.issued_to_student_id AS "issuedToStudentId", ei.issued_to_team_id AS "issuedToTeamId",
  ei.quantity, ei.issued_on AS "issuedOn", ei.due_on AS "dueOn", ei.returned_on AS "returnedOn",
  ei.condition_on_return AS "conditionOnReturn", ei.issue_reason AS "issueReason",
  ei.signature_object_key AS "signatureObjectKey", ei.signed_at AS "signedAt", ei.issued_by AS "issuedBy"`;

const FROM = `FROM equipment_issue ei JOIN equipment eq ON eq.id = ei.equipment_id`;

@Injectable()
export class EquipmentIssueRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Row-locks the equipment row first — the single-holder-of-a-resource
   * invariant (quantity_available can't go negative under concurrent issues)
   * needs SELECT...FOR UPDATE inside a transaction, not just an app-level check
   * (see .claude/CLAUDE.md's own architecture convention). Caller (the service)
   * must run this inside UnitOfWork. */
  async lockEquipment(
    equipmentId: string,
    executor: Queryable,
  ): Promise<{
    id: string;
    quantityTotal: number;
    quantityAvailable: number;
  } | null> {
    const { rows } = await executor.query<{
      id: string;
      quantity_total: number;
      quantity_available: number;
    }>(
      `SELECT id, quantity_total, quantity_available FROM equipment WHERE id = $1 FOR UPDATE`,
      [equipmentId],
    );
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      quantityTotal: rows[0].quantity_total,
      quantityAvailable: rows[0].quantity_available,
    };
  }

  async adjustAvailable(
    equipmentId: string,
    delta: number,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE equipment SET quantity_available = quantity_available + $2 WHERE id = $1`,
      [equipmentId, delta],
    );
  }

  /** Increments BOTH total and available — used only when new stock actually
   * arrives (restock delivery), never on issue/return which only move
   * quantity_available. */
  async addStock(
    equipmentId: string,
    quantity: number,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE equipment SET quantity_total = quantity_total + $2, quantity_available = quantity_available + $2 WHERE id = $1`,
      [equipmentId, quantity],
    );
  }

  async create(
    input: {
      equipmentId: string;
      issuedToStudentId?: string | null;
      issuedToTeamId?: string | null;
      quantity: number;
      dueOn?: string | null;
      issueReason: string;
      signatureObjectKey: string;
      issuedBy: string;
    },
    executor: Queryable,
  ): Promise<EquipmentIssueRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO equipment_issue
         (equipment_id, issued_to_student_id, issued_to_team_id, quantity, due_on,
          issue_reason, signature_object_key, signed_at, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
       RETURNING id`,
      [
        input.equipmentId,
        input.issuedToStudentId ?? null,
        input.issuedToTeamId ?? null,
        input.quantity,
        input.dueOn ?? null,
        input.issueReason,
        input.signatureObjectKey,
        input.issuedBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<EquipmentIssueRow | null> {
    const { rows } = await executor.query<EquipmentIssueRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE ei.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<{
    id: string;
    equipmentId: string;
    quantity: number;
    returnedOn: string | null;
  } | null> {
    const { rows } = await executor.query<{
      id: string;
      equipment_id: string;
      quantity: number;
      returned_on: string | null;
    }>(
      `SELECT id, equipment_id, quantity, returned_on FROM equipment_issue WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      equipmentId: rows[0].equipment_id,
      quantity: rows[0].quantity,
      returnedOn: rows[0].returned_on,
    };
  }

  async recordReturn(
    id: string,
    conditionOnReturn: string | null,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE equipment_issue SET returned_on = CURRENT_DATE, condition_on_return = $2 WHERE id = $1`,
      [id, conditionOnReturn],
    );
  }

  /** Every issue scoped to equipment belonging to sports this Faculty member is
   * authorized for — never a school-wide list. */
  async findOutstandingBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<EquipmentIssueRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<EquipmentIssueRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE eq.sport_id = ANY($1::uuid[]) AND ei.returned_on IS NULL ORDER BY ei.issued_on`,
      [sportIds],
    );
    return rows;
  }

  /** Outstanding (not returned) AND past due_on — the "overdue equipment" flag. */
  async findOverdueBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<EquipmentIssueRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<EquipmentIssueRow>(
      `SELECT ${COLUMNS} ${FROM}
       WHERE eq.sport_id = ANY($1::uuid[]) AND ei.returned_on IS NULL
         AND ei.due_on IS NOT NULL AND ei.due_on < CURRENT_DATE
       ORDER BY ei.due_on`,
      [sportIds],
    );
    return rows;
  }
}
