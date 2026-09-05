// Injectable pg Pool wrapper. This project talks to Postgres with raw parameterized SQL
// (pg) — Prisma is used only as Prisma Studio, a GUI over the same database, never as
// the query layer in application code.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

// pg's default DATE (oid 1082) parser builds a JS Date at LOCAL midnight, then
// res.json() serializes it with Date#toJSON() -> toISOString(), which converts
// to UTC -- on a server whose local TZ is ahead of UTC (e.g. IST, +5:30) that
// silently rolls every plain calendar date back to the previous day (a `date`
// column has no time-of-day or timezone to begin with, so there's nothing to
// convert). Registering this once, globally, makes pg hand back the raw
// 'YYYY-MM-DD' string untouched for every DATE column app-wide, instead of
// letting each caller discover and route around this one at a time.
types.setTypeParser(1082, (value) => value);

/** Anything that can run a parameterized query — a Pool, or a PoolClient mid-transaction. */
export interface Queryable {
  query<R extends QueryResultRow = any>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
}

@Injectable()
export class PostgresService implements OnModuleDestroy, Queryable {
  readonly pool: Pool;

  constructor(configService: ConfigService) {
    this.pool = new Pool({ connectionString: configService.get<string>('database.url') });
  }

  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
