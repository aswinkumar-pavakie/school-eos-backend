import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

// library_config is a single-row table. The row's id is not guaranteed to be
// any fixed value (the live row's id is a random uuid, not a sentinel), so
// every query addresses "the one row" instead of a hardcoded id -- a hardcoded
// id made get() return undefined and broke Issue books/Settings/fines.
const SINGLE_ROW = `(SELECT id FROM library_config ORDER BY updated_at DESC LIMIT 1)`;

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
      `SELECT ${COLUMNS} FROM library_config WHERE id = ${SINGLE_ROW}`,
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
         loan_period_days = COALESCE($1, loan_period_days),
         max_renewals = COALESCE($2, max_renewals),
         fine_per_day_paise = COALESCE($3, fine_per_day_paise),
         max_books_per_member = COALESCE($4, max_books_per_member),
         reservation_hold_days = COALESCE($5, reservation_hold_days),
         updated_at = now(),
         updated_by = $6
       WHERE id = ${SINGLE_ROW}`,
      [
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
