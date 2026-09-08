// Append-only history of date/time changes to an online_class — written before the
// parent row is updated (see OnlineClassesService.reschedule), so a schedule change
// never simply overwrites the old value without a trail.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface CreateRescheduleParams {
  onlineClassId: string;
  previousScheduledDate: string;
  previousStartTime: string;
  previousEndTime: string;
  newScheduledDate: string;
  newStartTime: string;
  newEndTime: string;
  reason: string | null;
  rescheduledBy: string;
}

@Injectable()
export class OnlineClassRescheduleRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    params: CreateRescheduleParams,
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO online_class_reschedule
         (online_class_id, previous_scheduled_date, previous_start_time, previous_end_time,
          new_scheduled_date, new_start_time, new_end_time, reason, rescheduled_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        params.onlineClassId,
        params.previousScheduledDate,
        params.previousStartTime,
        params.previousEndTime,
        params.newScheduledDate,
        params.newStartTime,
        params.newEndTime,
        params.reason,
        params.rescheduledBy,
      ],
    );
    return rows[0].id;
  }
}
