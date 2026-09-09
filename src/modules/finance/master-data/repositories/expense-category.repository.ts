import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  code: string | null;
  pettyLimitPaise: string;
}

function mapRow(row: any): ExpenseCategoryRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    pettyLimitPaise: row.petty_limit_paise,
  };
}

@Injectable()
export class ExpenseCategoryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async list(executor: Queryable = this.postgres): Promise<ExpenseCategoryRow[]> {
    const { rows } = await executor.query(`SELECT * FROM expense_category ORDER BY name ASC`);
    return rows.map(mapRow);
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<ExpenseCategoryRow | null> {
    const { rows } = await executor.query(`SELECT * FROM expense_category WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    input: { name: string; code?: string; pettyLimitPaise?: string },
    executor: Queryable = this.postgres,
  ): Promise<ExpenseCategoryRow> {
    const { rows } = await executor.query(
      `INSERT INTO expense_category (name, code, petty_limit_paise)
       VALUES ($1, $2, COALESCE($3, 500000))
       RETURNING *`,
      [input.name, input.code ?? null, input.pettyLimitPaise ?? null],
    );
    return mapRow(rows[0]);
  }
}
