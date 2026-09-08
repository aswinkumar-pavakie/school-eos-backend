// Narrow read of the `school` singleton row (id is always 1) — only its timezone,
// needed so Google Calendar events are created in the school's actual configured
// timezone rather than a hard-coded string.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

const FALLBACK_TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class SchoolRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getTimezone(executor: Queryable = this.postgres): Promise<string> {
    const { rows } = await executor.query<{ timezone: string }>(
      `SELECT timezone FROM school WHERE id = 1`,
    );
    return rows[0]?.timezone ?? FALLBACK_TIMEZONE;
  }
}
