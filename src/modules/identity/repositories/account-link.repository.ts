// account_link: one row = "this faculty member (owner) may switch to this class
// login (linked), on this phone (device_id)". Created once, on the phone, after the
// class login's own password was proven. Design:
// school-eos-website/rnd-linked-account-switching.md.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AccountLinkRow {
  id: string;
  ownerPersonId: string;
  linkedPersonId: string;
  deviceId: string;
  deviceLabel: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface MappedSeat {
  linkedPersonId: string;
  gradeName: string;
  sectionName: string;
  email: string | null;
  linkedOnThisDevice: boolean;
}

export interface LinkListItem extends AccountLinkRow {
  gradeName: string | null;
  sectionName: string | null;
}

const LINK_COLUMNS = `id, owner_person_id AS "ownerPersonId", linked_person_id AS "linkedPersonId",
  device_id AS "deviceId", device_label AS "deviceLabel", created_at AS "createdAt",
  last_used_at AS "lastUsedAt"`;

@Injectable()
export class AccountLinkRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The class seats the ADMIN has mapped to this faculty member right now. */
  async listMappedSeats(
    ownerPersonId: string,
    deviceId: string | null,
    executor: Queryable = this.postgres,
  ): Promise<MappedSeat[]> {
    const { rows } = await executor.query<MappedSeat>(
      `SELECT a.class_teacher_login_id AS "linkedPersonId", g.name AS "gradeName",
              l.section_name AS "sectionName",
              (SELECT li.value FROM login_identifier li
                WHERE li.person_id = a.class_teacher_login_id
                ORDER BY li.created_at LIMIT 1) AS email,
              EXISTS (SELECT 1 FROM account_link k
                       WHERE k.owner_person_id = a.faculty_person_id
                         AND k.linked_person_id = a.class_teacher_login_id
                         AND k.device_id = $2 AND k.revoked_at IS NULL) AS "linkedOnThisDevice"
       FROM class_teacher_login_assignment a
       JOIN class_teacher_login l ON l.login_person_id = a.class_teacher_login_id
       JOIN grade g ON g.id = l.grade_id
       WHERE a.faculty_person_id = $1 AND a.status = 'ACTIVE'
       ORDER BY g.level_no, l.section_name`,
      [ownerPersonId, deviceId],
    );
    return rows;
  }

/** "5-B" for a class login (display only). */
  async findSeatLabel(
    linkedPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ label: string }>(
      `SELECT g.name || '-' || l.section_name AS label
       FROM class_teacher_login l JOIN grade g ON g.id = l.grade_id
       WHERE l.login_person_id = $1`,
      [linkedPersonId],
    );
    return rows[0]?.label ?? null;
  }

/** Classes ALREADY added on this phone whose admin mapping still holds. A session on
   * any other phone gets an empty list, so a leaked Faculty password reveals nothing about
   * which classes (or emails) are mapped to the teacher. */
  async listLinkedHere(
    ownerPersonId: string,
    deviceId: string | null,
    executor: Queryable = this.postgres,
  ): Promise<MappedSeat[]> {
    if (!deviceId) return [];
    const { rows } = await executor.query<MappedSeat>(
      `SELECT a.class_teacher_login_id AS "linkedPersonId", g.name AS "gradeName",
              l.section_name AS "sectionName",
              (SELECT li.value FROM login_identifier li
                WHERE li.person_id = a.class_teacher_login_id
                ORDER BY li.created_at LIMIT 1) AS email,
              true AS "linkedOnThisDevice"
       FROM account_link k
       JOIN class_teacher_login_assignment a
         ON a.class_teacher_login_id = k.linked_person_id
        AND a.faculty_person_id = k.owner_person_id AND a.status = 'ACTIVE'
       JOIN class_teacher_login l ON l.login_person_id = a.class_teacher_login_id
       JOIN grade g ON g.id = l.grade_id
       WHERE k.owner_person_id = $1 AND k.device_id = $2 AND k.revoked_at IS NULL
         AND k.last_used_at > now() - interval '90 days'
       ORDER BY g.level_no, l.section_name`,
      [ownerPersonId, deviceId],
    );
    return rows;
  }

  /** Refused "add account" attempts by this person recently (audit trail), optionally
   * only those made from one phone/browser. */
  async countRecentAddFailures(
    ownerPersonId: string,
    minutes: number,
    deviceId: string | null = null,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    const { rows } = await executor.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_event
       WHERE actor_person_id = $1 AND action = 'ACCOUNT_LINK_DENIED'
         AND after_data ->> 'reason' IN ('NOT_MAPPED', 'WRONG_PASSWORD', 'LOCKED')
         AND occurred_at > now() - ($2 || ' minutes')::interval
         AND ($3::text IS NULL OR after_data ->> 'deviceId' = $3)`,
      [ownerPersonId, String(minutes), deviceId],
    );
    return parseInt(rows[0].n, 10);
  }

  /** The admin's mapping, right now: is `ownerPersonId` the ACTIVE holder of this class login? */
  async isCurrentHolder(
    ownerPersonId: string,
    linkedPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM class_teacher_login_assignment
       WHERE class_teacher_login_id = $2 AND faculty_person_id = $1 AND status = 'ACTIVE'`,
      [ownerPersonId, linkedPersonId],
    );
    return rows.length > 0;
  }

  async countOtherActiveDevices(
    ownerPersonId: string,
    deviceId: string,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    const { rows } = await executor.query<{ n: string }>(
      `SELECT count(DISTINCT device_id) AS n FROM account_link
       WHERE owner_person_id = $1 AND revoked_at IS NULL AND device_id <> $2`,
      [ownerPersonId, deviceId],
    );
    return parseInt(rows[0].n, 10);
  }

  /** The active link joining two accounts on this device, in EITHER direction. */
  async findActiveBetween(
    personA: string,
    personB: string,
    deviceId: string,
    executor: Queryable = this.postgres,
  ): Promise<AccountLinkRow | null> {
    const { rows } = await executor.query<AccountLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM account_link
       WHERE device_id = $3 AND revoked_at IS NULL
         AND last_used_at > now() - interval '90 days'
         AND ((owner_person_id = $1 AND linked_person_id = $2)
           OR (owner_person_id = $2 AND linked_person_id = $1))
       LIMIT 1`,
      [personA, personB, deviceId],
    );
    return rows[0] ?? null;
  }

  /** Idempotent: linking again on the same phone keeps the one active row. */
  async createOrTouch(
    input: {
      ownerPersonId: string;
      linkedPersonId: string;
      deviceId: string;
      deviceLabel: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<AccountLinkRow> {
    const { rows } = await executor.query<AccountLinkRow>(
      `INSERT INTO account_link (owner_person_id, linked_person_id, device_id, device_label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_person_id, linked_person_id, device_id) WHERE revoked_at IS NULL
       DO UPDATE SET last_used_at = now(), device_label = COALESCE(EXCLUDED.device_label, account_link.device_label)
       RETURNING ${LINK_COLUMNS}`,
      [input.ownerPersonId, input.linkedPersonId, input.deviceId, input.deviceLabel],
    );
    return rows[0];
  }

  async touch(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`UPDATE account_link SET last_used_at = now() WHERE id = $1`, [id]);
  }

  /** The owner's own active links (for the "linked phones" list). */
  async listForOwner(
    ownerPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<LinkListItem[]> {
    const { rows } = await executor.query<LinkListItem>(
      `SELECT k.id, k.owner_person_id AS "ownerPersonId", k.linked_person_id AS "linkedPersonId",
              k.device_id AS "deviceId", k.device_label AS "deviceLabel",
              k.created_at AS "createdAt", k.last_used_at AS "lastUsedAt",
              g.name AS "gradeName", l.section_name AS "sectionName"
       FROM account_link k
       LEFT JOIN class_teacher_login l ON l.login_person_id = k.linked_person_id
       LEFT JOIN grade g ON g.id = l.grade_id
       WHERE k.owner_person_id = $1 AND k.revoked_at IS NULL
       ORDER BY k.last_used_at DESC`,
      [ownerPersonId],
    );
    return rows;
  }

  async findOwnedById(
    id: string,
    ownerPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<AccountLinkRow | null> {
    const { rows } = await executor.query<AccountLinkRow>(
      `SELECT ${LINK_COLUMNS} FROM account_link
       WHERE id = $1 AND owner_person_id = $2 AND revoked_at IS NULL`,
      [id, ownerPersonId],
    );
    return rows[0] ?? null;
  }

  // ---- revocation ---------------------------------------------------------------
  // Every revoke also ends the sessions that were minted THROUGH the link on that
  // phone (only "switched-in" sessions, never a person's own direct login), so a
  // revoked link cannot keep a class session alive.

  private async revokeWhere(
    where: string,
    params: unknown[],
    reason: string,
    executor: Queryable,
  ): Promise<number> {
    const { rows } = await executor.query<{
      owner: string;
      linked: string;
      device: string;
    }>(
      `UPDATE account_link SET revoked_at = now(), revoked_reason = $1
       WHERE revoked_at IS NULL AND ${where}
       RETURNING owner_person_id AS owner, linked_person_id AS linked, device_id AS device`,
      [reason, ...params],
    );
    for (const r of rows) {
      await executor.query(
        `DELETE FROM user_session
         WHERE device_id = $1 AND linked_from_session_id IS NOT NULL AND person_id IN ($2, $3)`,
        [r.device, r.owner, r.linked],
      );
    }
    return rows.length;
  }

  revokeById(id: string, reason: string, executor: Queryable = this.postgres): Promise<number> {
    return this.revokeWhere(`id = $2`, [id], reason, executor);
  }

  /** Every link of a class seat (teacher changed, seat vacated, class password reset). */
  revokeForLinked(
    linkedPersonId: string,
    reason: string,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    return this.revokeWhere(`linked_person_id = $2`, [linkedPersonId], reason, executor);
  }

  /** Every link a person owns, optionally sparing the phone they are on right now. */
  revokeForOwner(
    ownerPersonId: string,
    reason: string,
    exceptDeviceId: string | null = null,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    return exceptDeviceId
      ? this.revokeWhere(
          `owner_person_id = $2 AND device_id <> $3`,
          [ownerPersonId, exceptDeviceId],
          reason,
          executor,
        )
      : this.revokeWhere(`owner_person_id = $2`, [ownerPersonId], reason, executor);
  }

  /** Links nobody has used for a long time (run opportunistically). */
  revokeIdle(days: number, executor: Queryable = this.postgres): Promise<number> {
    return this.revokeWhere(
      `last_used_at < now() - ($2 || ' days')::interval`,
      [String(days)],
      'IDLE_EXPIRED',
      executor,
    );
  }
}
