// Injectable pg Pool wrapper. This project talks to Postgres with raw parameterized SQL
// (pg) — Prisma is used only as Prisma Studio, a GUI over the same database, never as
// the query layer in application code.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

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
