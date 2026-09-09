import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TeamMemberRow {
  id: string;
  teamId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  jerseyNo: number | null;
  role: string | null;
  joinedOn: string;
  status: string;
}

const COLUMNS = `tm.id, tm.team_id AS "teamId", tm.student_id AS "studentId",
  p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  tm.jersey_no AS "jerseyNo", tm.role, tm.joined_on AS "joinedOn", tm.status`;

const FROM = `FROM team_member tm JOIN student s ON s.id = tm.student_id JOIN person p ON p.id = s.person_id`;

@Injectable()
export class TeamMemberRepository {
  constructor(private readonly postgres: PostgresService) {}

  async add(
    input: {
      teamId: string;
      studentId: string;
      jerseyNo?: number | null;
      role?: string | null;
    },
    executor: Queryable = this.postgres,
  ): Promise<TeamMemberRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO team_member (team_id, student_id, jersey_no, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        input.teamId,
        input.studentId,
        input.jerseyNo ?? null,
        input.role ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<TeamMemberRow | null> {
    const { rows } = await executor.query<TeamMemberRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE tm.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findActiveByTeam(
    teamId: string,
    executor: Queryable = this.postgres,
  ): Promise<TeamMemberRow[]> {
    const { rows } = await executor.query<TeamMemberRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE tm.team_id = $1 AND tm.status = 'ACTIVE' ORDER BY p.first_name, p.last_name`,
      [teamId],
    );
    return rows;
  }

  /** Ends a roster membership — deactivate, not delete, matching this repo's
   * "supersede, not delete" convention for anything with business meaning
   * (equipment issues, achievements, etc. all reference team_member historically). */
  async end(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rows } = await executor.query(
      `UPDATE team_member SET status = 'ENDED' WHERE id = $1 AND status = 'ACTIVE' RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }
}
