// Real, already-existing notification_preference table -- per (person,
// notification_type) channel choice + quiet hours. No row yet exists for
// anyone (this feature has never been wired up before), so this repository's
// own defaults mirror the table's own real column defaults exactly
// (channels_enabled = ['PUSH'], quiet hours 21:00-07:00) -- an opt-out
// model: every notification type is push-enabled until a person explicitly
// turns one off, never silently off until someone opts in.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface NotificationPreference {
  channelsEnabled: string[];
  quietHoursFrom: string | null;
  quietHoursTo: string | null;
}

const DEFAULT_PREFERENCE: NotificationPreference = {
  channelsEnabled: ['PUSH'],
  quietHoursFrom: '21:00:00',
  quietHoursTo: '07:00:00',
};

@Injectable()
export class NotificationPreferenceRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getPreference(personId: string, notificationType: string, executor: Queryable = this.postgres): Promise<NotificationPreference> {
    const { rows } = await executor.query(
      `SELECT channels_enabled, quiet_hours_from, quiet_hours_to
       FROM notification_preference WHERE person_id = $1 AND notification_type = $2`,
      [personId, notificationType],
    );
    if (!rows.length) return DEFAULT_PREFERENCE;
    return {
      channelsEnabled: rows[0].channels_enabled,
      quietHoursFrom: rows[0].quiet_hours_from,
      quietHoursTo: rows[0].quiet_hours_to,
    };
  }
}
