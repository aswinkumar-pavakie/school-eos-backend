// assignee_staff_id/assignee_student_id reference `staff`/`student` (Phase 2's
// People module) -- accepted as opaque UUIDs, same cross-module-FK pattern
// community-membership.repository.ts already uses. Joined here only for
// display (name), not validated against those modules' own repositories; a
// bad reference surfaces as a clean foreign-key-violation 409.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CommunityPositionRow {
  id: string;
  communityId: string;
  title: string;
  assigneeType: 'STAFF' | 'STUDENT';
  assigneeStaffId: string | null;
  assigneeStudentId: string | null;
  assigneeFirstName: string;
  assigneeLastName: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface CreatePositionInput {
  communityId: string;
  title: string;
  assigneeType: 'STAFF' | 'STUDENT';
  assigneeStaffId?: string | null;
  assigneeStudentId?: string | null;
  createdBy: string;
}

export interface UpdatePositionInput {
  title?: string;
  assigneeType?: 'STAFF' | 'STUDENT';
  assigneeStaffId?: string | null;
  assigneeStudentId?: string | null;
}

const COLUMNS = `cp.id, cp.community_id AS "communityId", cp.title,
  cp.assignee_type AS "assigneeType", cp.assignee_staff_id AS "assigneeStaffId",
  cp.assignee_student_id AS "assigneeStudentId",
  COALESCE(staff_p.first_name, student_p.first_name) AS "assigneeFirstName",
  COALESCE(staff_p.last_name, student_p.last_name) AS "assigneeLastName",
  cp.created_by AS "createdBy", cp.created_at AS "createdAt"`;

const JOINS = `
  LEFT JOIN staff st ON st.id = cp.assignee_staff_id
  LEFT JOIN person staff_p ON staff_p.id = st.person_id
  LEFT JOIN student stu ON stu.id = cp.assignee_student_id
  LEFT JOIN person student_p ON student_p.id = stu.person_id`;

@Injectable()
export class CommunityPositionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByCommunityId(
    communityId: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityPositionRow[]> {
    const { rows } = await executor.query<CommunityPositionRow>(
      `SELECT ${COLUMNS} FROM community_position cp ${JOINS}
       WHERE cp.community_id = $1
       ORDER BY cp.created_at`,
      [communityId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<CommunityPositionRow | null> {
    const { rows } = await executor.query<CommunityPositionRow>(
      `SELECT ${COLUMNS} FROM community_position cp ${JOINS} WHERE cp.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreatePositionInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityPositionRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO community_position
         (community_id, title, assignee_type, assignee_staff_id, assignee_student_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.communityId,
        input.title,
        input.assigneeType,
        input.assigneeStaffId ?? null,
        input.assigneeStudentId ?? null,
        input.createdBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdatePositionInput,
    executor: Queryable = this.postgres,
  ): Promise<CommunityPositionRow | null> {
    await executor.query(
      `UPDATE community_position SET
         title = COALESCE($2, title),
         assignee_type = COALESCE($3, assignee_type),
         assignee_staff_id = $4,
         assignee_student_id = $5
       WHERE id = $1`,
      [
        id,
        input.title ?? null,
        input.assigneeType ?? null,
        input.assigneeStaffId ?? null,
        input.assigneeStudentId ?? null,
      ],
    );
    return this.findById(id, executor);
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM community_position WHERE id = $1`, [id]);
  }
}
