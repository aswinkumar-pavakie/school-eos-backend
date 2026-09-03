// Runs a callback inside a single BEGIN/COMMIT/ROLLBACK against one pooled connection.
// Raw-pg equivalent of prisma.$transaction — used wherever a request must atomically
// touch more than one auth table (e.g. login's lockout-counter update + session insert).

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';

@Injectable()
export class UnitOfWork {
  constructor(private readonly postgres: PostgresService) {}

  async run<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.postgres.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
