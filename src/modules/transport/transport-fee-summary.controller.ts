// Real "Fee collected" figure for the Transport Overview dashboard --
// aggregate-only, never individual payment records: Transport Manager gets a
// real total, not Finance's own detailed payment access. Reuses the real
// `Transport Fee` fee head (fee_head.code = 'TRANSPORT') that already exists
// -- no schema change, see query.md's own note on this. Deliberately its own
// tiny controller rather than added to transport-ops (that module's header
// comment documents a scope wall against touching Finance tables at all).

import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';

@Roles('ADMIN', 'TRANSPORT_MANAGER')
@Controller('transport-ops/fee-collected')
export class TransportFeeSummaryController {
  constructor(private readonly postgres: PostgresService) {}

  @Get()
  async summary(@Query('from') from: string, @Query('to') to: string) {
    const { rows } = await this.postgres.query<{ totalPaise: string }>(
      `SELECT COALESCE(SUM(pa.amount_paise), 0)::text AS "totalPaise"
       FROM payment_allocation pa
       JOIN payment p ON p.id = pa.payment_id
       JOIN fee_demand fd ON fd.id = pa.fee_demand_id
       JOIN fee_head fh ON fh.id = fd.fee_head_id
       WHERE fh.code = 'TRANSPORT'
         AND p.state IN ('CONFIRMED', 'RECONCILED')
         AND p.confirmed_at::date BETWEEN $1 AND $2`,
      [from, to],
    );
    return { data: { totalPaise: rows[0]?.totalPaise ?? '0' } };
  }
}
