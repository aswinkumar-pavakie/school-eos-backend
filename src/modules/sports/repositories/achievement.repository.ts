// The shared `achievement` table (student's consolidated development profile —
// per the workflow doc: "these feed the student's consolidated development
// profile automatically, no separate step needed on the student side"). No
// other module writes into it yet (confirmed during discovery), so this is
// the first real implementation — Sports writes here with
// source_domain='SPORTS', reference_id pointing back at the owning
// sports_achievement row (see SportsAchievementRepository.create's two-step
// insert, done inside one transaction).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface AchievementRow {
  id: string;
  studentId: string;
  title: string;
  level: string;
  awardedOn: string;
  certificateKey: string | null;
  sourceDomain: string | null;
  referenceId: string | null;
}

const COLUMNS = `id, student_id AS "studentId", title, level, awarded_on AS "awardedOn",
  certificate_key AS "certificateKey", source_domain AS "sourceDomain", reference_id AS "referenceId"`;

@Injectable()
export class AchievementRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      studentId: string;
      title: string;
      level: string;
      awardedOn: string;
      certificateKey?: string | null;
    },
    executor: Queryable,
  ): Promise<AchievementRow> {
    const { rows } = await executor.query<AchievementRow>(
      `INSERT INTO achievement (student_id, title, level, awarded_on, certificate_key, source_domain)
       VALUES ($1, $2, $3, $4, $5, 'SPORTS')
       RETURNING ${COLUMNS}`,
      [
        input.studentId,
        input.title,
        input.level,
        input.awardedOn,
        input.certificateKey ?? null,
      ],
    );
    return rows[0];
  }

  async setReferenceId(
    id: string,
    referenceId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE achievement SET reference_id = $2 WHERE id = $1`,
      [id, referenceId],
    );
  }
}
