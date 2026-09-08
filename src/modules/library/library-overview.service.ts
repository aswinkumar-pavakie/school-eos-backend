import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { LibraryFineRepository } from './repositories/library-fine.repository';

export const LIBRARY_OBJECT_TYPES = [
  'library_book',
  'library_book_copy',
  'library_member',
  'library_issue',
  'library_reservation',
  'library_fine',
  'library_config',
];

export interface LibraryOverview {
  totalBooks: number;
  totalCopies: number;
  availableCopies: number;
  issuedCopies: number;
  reservedCopies: number;
  overdueCount: number;
  lostCopies: number;
  damagedCopies: number;
  underRepairCopies: number;
  retiredCopies: number;
  activeMembers: number;
  pendingReservationsCount: number;
  readyReservationsCount: number;
  pendingFinesAmountPaise: string;
  sentToFinanceFinesAmountPaise: string;
  recentActivity: { id: string; action: string; detail: string | null; occurredAt: Date }[];
}

@Injectable()
export class LibraryOverviewService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly fineRepo: LibraryFineRepository,
  ) {}

  async get(): Promise<LibraryOverview> {
    const [booksResult, copiesResult, membersResult, reservationsResult, pendingFines, sentToFinanceFines, activityResult] =
      await Promise.all([
        this.postgres.query<{ count: string }>(`SELECT count(*) FROM library_book WHERE status = 'ACTIVE'`),
        this.postgres.query<{
          total: string;
          available: string;
          issued: string;
          reserved: string;
          overdue: string;
          lost: string;
          damaged: string;
          underRepair: string;
          retired: string;
        }>(
          `SELECT count(*) AS total,
                  count(*) FILTER (WHERE status = 'AVAILABLE') AS available,
                  count(*) FILTER (WHERE status = 'ISSUED') AS issued,
                  count(*) FILTER (WHERE status = 'RESERVED') AS reserved,
                  count(*) FILTER (WHERE status = 'LOST') AS lost,
                  count(*) FILTER (WHERE status = 'DAMAGED') AS damaged,
                  count(*) FILTER (WHERE status = 'UNDER_REPAIR') AS "underRepair",
                  count(*) FILTER (WHERE status = 'RETIRED') AS retired,
                  (SELECT count(*) FROM library_issue WHERE status IN ('ISSUED', 'OVERDUE') AND due_date < current_date) AS overdue
           FROM library_book_copy`,
        ),
        this.postgres.query<{ count: string }>(`SELECT count(*) FROM library_member WHERE status = 'ACTIVE'`),
        this.postgres.query<{ pending: string; ready: string }>(
          `SELECT count(*) FILTER (WHERE status = 'PENDING') AS pending,
                  count(*) FILTER (WHERE status = 'READY') AS ready
           FROM library_reservation`,
        ),
        this.fineRepo.sumPendingAmount(),
        this.fineRepo.sumSentToFinanceAmount(),
        this.postgres.query<{
          id: string;
          action: string;
          object_type: string;
          occurred_at: Date;
          after_data: unknown;
          before_data: unknown;
        }>(
          `SELECT ae.id, ae.action, ae.object_type, ae.occurred_at, ae.after_data, ae.before_data
           FROM audit_event ae
           WHERE ae.object_type = ANY($1)
           ORDER BY ae.occurred_at DESC
           LIMIT 8`,
          [LIBRARY_OBJECT_TYPES],
        ),
      ]);

    const copies = copiesResult.rows[0];

    return {
      totalBooks: parseInt(booksResult.rows[0].count, 10),
      totalCopies: parseInt(copies.total, 10),
      availableCopies: parseInt(copies.available, 10),
      issuedCopies: parseInt(copies.issued, 10),
      reservedCopies: parseInt(copies.reserved, 10),
      overdueCount: parseInt(copies.overdue, 10),
      lostCopies: parseInt(copies.lost, 10),
      damagedCopies: parseInt(copies.damaged, 10),
      underRepairCopies: parseInt(copies.underRepair, 10),
      retiredCopies: parseInt(copies.retired, 10),
      activeMembers: parseInt(membersResult.rows[0].count, 10),
      pendingReservationsCount: parseInt(reservationsResult.rows[0].pending, 10),
      readyReservationsCount: parseInt(reservationsResult.rows[0].ready, 10),
      pendingFinesAmountPaise: pendingFines,
      sentToFinanceFinesAmountPaise: sentToFinanceFines,
      recentActivity: activityResult.rows.map((row) => ({
        id: row.id,
        action: row.action,
        detail: describeActivity(row.after_data, row.before_data),
        occurredAt: row.occurred_at,
      })),
    };
  }
}

/** Same generic best-effort description approach as the Admin dashboard's own
 * describeActivity -- covers this module's own action shapes without hardcoding
 * every action type. */
export function describeActivity(afterData: unknown, beforeData: unknown): string | null {
  const data = (afterData ?? beforeData) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return null;
  if (typeof data.title === 'string') return data.title;
  if (typeof data.copyCode === 'string') return data.copyCode;
  if (typeof data.reason === 'string') return data.reason;
  if (typeof data.status === 'string') return data.status;
  return null;
}
