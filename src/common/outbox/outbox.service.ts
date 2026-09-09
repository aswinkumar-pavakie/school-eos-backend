// enqueue() only for now — a real delivery processor (notification_delivery rows,
// push/SMS/email dispatch) comes later. This just guarantees the notification row is
// written in the SAME transaction as whatever triggered it, so a crash mid-request can
// never leave a state change without its corresponding notification.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../infrastructure/postgres/postgres.service';

export interface OutboxNotification {
  personId: string;
  notificationType: string;
  title: string;
  body: string;
  relatedObjectType?: string;
  relatedObjectId?: string;
  deepLink?: string;
  aboutStudentId?: string;
  isEmergency?: boolean;
}

@Injectable()
export class OutboxService {
  constructor(private readonly postgres: PostgresService) {}

  async enqueue(
    notification: OutboxNotification,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO notification
         (person_id, about_student_id, notification_type, title, body,
          related_object_type, related_object_id, deep_link, is_emergency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        notification.personId,
        notification.aboutStudentId ?? null,
        notification.notificationType,
        notification.title,
        notification.body,
        notification.relatedObjectType ?? null,
        notification.relatedObjectId ?? null,
        notification.deepLink ?? null,
        notification.isEmergency ?? false,
      ],
    );
  }
}
