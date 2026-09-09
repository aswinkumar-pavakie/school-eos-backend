import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

export interface LibraryConfigRow {
  loanPeriodDays: number;
  maxRenewals: number;
  finePerDayPaise: string;
  maxBooksPerMember: number;
  reservationHoldDays: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface UpdateConfigInput {
  loanPeriodDays?: number;
  maxRenewals?: number;
  finePerDayPaise?: number;
  maxBooksPerMember?: number;
  reservationHoldDays?: number;
}

const COLUMNS = `loan_period_days AS "loanPeriodDays", max_renewals AS "maxRenewals",
  fine_per_day_paise AS "finePerDayPaise", max_books_per_member AS "maxBooksPerMember",
  reservation_hold_days AS "reservationHoldDays",
  updated_at AS "updatedAt", updated_by AS "updatedBy"`;

@Injectable()
export class LibraryConfigRepository {
  constructor(private readonly postgres: PostgresService) {}

  async get(executor: Queryable = this.postgres): Promise<LibraryConfigRow> {
    const { rows } = await executor.query<LibraryConfigRow>(
      `SELECT ${COLUMNS} FROM library_config WHERE id = $1`,
      [CONFIG_ID],
    );
    return rows[0];
  }

  async update(
    input: UpdateConfigInput,
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<LibraryConfigRow> {
    await executor.query(
      `UPDATE library_config SET
         loan_period_days = COALESCE($2, loan_period_days),
         max_renewals = COALESCE($3, max_renewals),
         fine_per_day_paise = COALESCE($4, fine_per_day_paise),
         max_books_per_member = COALESCE($5, max_books_per_member),
         reservation_hold_days = COALESCE($6, reservation_hold_days),
         updated_at = now(),
         updated_by = $7
       WHERE id = $1`,
      [
        CONFIG_ID,
        input.loanPeriodDays ?? null,
        input.maxRenewals ?? null,
        input.finePerDayPaise ?? null,
        input.maxBooksPerMember ?? null,
        input.reservationHoldDays ?? null,
        updatedBy,
      ],
    );
    return this.get(executor);
  }
}
