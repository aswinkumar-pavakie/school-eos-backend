// Read-only Principal dashboard summary. Deliberately its own tiny set of count
// queries -- same "no authoritative repository being duplicated" reasoning
// modules/dashboard/dashboard.service.ts already documents for Admin's own summary
// -- NOT a slimmed-down reuse of that service, because its response shape bundles
// Admin-operational fields (draft-fee-structure action items, the admin audit
// feed) that aren't Principal's concern; extending it would leak that shape to a
// role it wasn't built for. Per the approved API doc (Principal: "dashboard/
// approvals on mobile, full reports on web"), this stays deliberately light --
// pending approvals (reused from the existing generic /approvals engine, not
// duplicated here) plus a few real, leadership-relevant institution counts.

import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';

export interface PrincipalDashboardSummary {
  activeStudents: number;
  activeStaff: number;
  currentAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  generatedAt: string;
}

@Injectable()
export class PrincipalDashboardService {
  constructor(private readonly postgres: PostgresService) {}

  async getSummary(): Promise<PrincipalDashboardSummary> {
    const [studentsResult, staffResult, yearResult] = await Promise.all([
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM student WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM staff WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
      }>(
        `SELECT id, name, start_date, end_date FROM academic_year WHERE is_current LIMIT 1`,
      ),
    ]);

    const year = yearResult.rows[0];

    return {
      activeStudents: parseInt(studentsResult.rows[0].count, 10),
      activeStaff: parseInt(staffResult.rows[0].count, 10),
      currentAcademicYear: year
        ? {
            id: year.id,
            name: year.name,
            startDate: year.start_date,
            endDate: year.end_date,
          }
        : null,
      generatedAt: new Date().toISOString(),
    };
  }
}
