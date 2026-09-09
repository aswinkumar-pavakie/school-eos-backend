// Read-only cross-module aggregation for Admin's Reports & Analytics page. Mirrors
// dashboard.service.ts's own pattern: its own independent count queries for the
// domains with no single authoritative repository worth importing (enrollment,
// staff, attendance, transport, hostel, inventory), and a straight call into the
// existing service/repository for the three domains that already have one
// (Fees -> AdminFinanceModule's FeeOverviewService, Library ->
// LibraryModule's LibraryOverviewService, Requests & Approvals ->
// RequestsApprovalsModule's ApprovalRequestRepository).

import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { FeeOverviewService } from '../finance/fee-overview.service';
import { LibraryOverviewService } from '../library/library-overview.service';
import { ApprovalRequestRepository } from '../requests-approvals/repositories/approval-request.repository';

export interface ReportsSummary {
  enrollment: {
    byGrade: { gradeName: string; count: number }[];
    byGender: { gender: string; count: number }[];
    activeCount: number;
    inactiveCount: number;
  };
  staff: {
    byDesignation: { designation: string; count: number }[];
    teachingCount: number;
    nonTeachingCount: number;
  };
  attendance: {
    dailyPercentPresent: { date: string; percentPresent: number }[];
  };
  fees: {
    byState: { state: string; count: number }[];
    totalOutstandingPaise: string;
  };
  transport: {
    ridershipByRoute: { routeName: string; count: number }[];
    vehiclesByStatus: { status: string; count: number }[];
  };
  hostel: {
    occupancyByHostel: { hostelName: string; occupied: number; vacant: number }[];
  };
  inventory: {
    byStatus: { status: string; count: number }[];
  };
  library: {
    byStatus: { status: string; count: number }[];
    outstandingFinesPaise: string | number;
  };
  requestsApprovals: {
    byState: { state: string; count: number }[];
    byType: { requestType: string; count: number }[];
  };
  generatedAt: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly feeOverviewService: FeeOverviewService,
    private readonly libraryOverviewService: LibraryOverviewService,
    private readonly approvalRequestRepo: ApprovalRequestRepository,
  ) {}

  async getSummary(): Promise<ReportsSummary> {
    const [
      gradeResult,
      genderResult,
      studentStatusResult,
      designationResult,
      staffTeachingResult,
      attendanceResult,
      feeStateCounts,
      feeOverview,
      ridershipResult,
      vehicleStatusResult,
      hostelOccupancyResult,
      inventoryStatusResult,
      libraryOverview,
      requestStateCounts,
      requestTypeCounts,
    ] = await Promise.all([
      this.postgres.query<{ gradeName: string; count: string }>(
        `SELECT g.name AS "gradeName", count(*) AS count
         FROM student s
         JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
           AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         JOIN section sec ON sec.id = se.section_id
         JOIN grade g ON g.id = sec.grade_id
         WHERE s.status = 'ACTIVE'
         GROUP BY g.id, g.name, g.level_no
         ORDER BY g.level_no ASC`,
      ),
      this.postgres.query<{ gender: string; count: string }>(
        `SELECT p.gender, count(*) AS count
         FROM student s
         JOIN person p ON p.id = s.person_id
         WHERE s.status = 'ACTIVE' AND p.gender IS NOT NULL
         GROUP BY p.gender
         ORDER BY count(*) DESC`,
      ),
      this.postgres.query<{ active: string; inactive: string }>(
        `SELECT count(*) FILTER (WHERE status = 'ACTIVE') AS active,
                count(*) FILTER (WHERE status IN ('LEFT', 'TC_ISSUED', 'ARCHIVED')) AS inactive
         FROM student`,
      ),
      this.postgres.query<{ designation: string; count: string }>(
        `SELECT designation, count(*) AS count
         FROM staff
         WHERE status = 'ACTIVE' AND designation IS NOT NULL
         GROUP BY designation
         ORDER BY count(*) DESC`,
      ),
      this.postgres.query<{ teaching: string; non_teaching: string }>(
        `SELECT count(*) FILTER (WHERE is_teaching) AS teaching,
                count(*) FILTER (WHERE NOT is_teaching) AS non_teaching
         FROM staff
         WHERE status = 'ACTIVE'`,
      ),
      // Effective status (base status, overridden by the latest correction once one
      // exists) -- same derivation attendance-record.repository.ts documents and uses,
      // replicated here rather than imported since this is a cross-cutting count query.
      this.postgres.query<{ date: string; percent_present: string }>(
        `SELECT ases.session_date::text AS date,
                round(100.0 * count(*) FILTER (WHERE COALESCE(lc.new_status, ar.status) = 'PRESENT') / count(*), 1)
                  AS percent_present
         FROM attendance_session ases
         JOIN attendance_record ar ON ar.session_id = ases.id
         LEFT JOIN LATERAL (
           SELECT new_status FROM attendance_correction
           WHERE attendance_record_id = ar.id
           ORDER BY corrected_at DESC LIMIT 1
         ) lc ON true
         WHERE ases.session_date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY ases.session_date
         ORDER BY ases.session_date ASC`,
      ),
      this.feeOverviewService.getStateCounts(),
      this.feeOverviewService.get({}),
      this.postgres.query<{ routeName: string; count: string }>(
        `SELECT r.name AS "routeName", count(sta.id) AS count
         FROM route r
         JOIN route_stop rs ON rs.route_id = r.id
         JOIN student_transport_allocation sta ON sta.route_stop_id = rs.id AND sta.status = 'ACTIVE'
         WHERE r.status = 'ACTIVE'
         GROUP BY r.id, r.name
         ORDER BY count(sta.id) DESC`,
      ),
      this.postgres.query<{ status: string; count: string }>(
        `SELECT operational_status AS status, count(*) AS count FROM vehicle GROUP BY operational_status`,
      ),
      this.postgres.query<{ hostelName: string; occupied: string; vacant: string }>(
        `SELECT h.name AS "hostelName",
                count(*) FILTER (WHERE bed.status = 'OCCUPIED') AS occupied,
                count(*) FILTER (WHERE bed.status != 'OCCUPIED') AS vacant
         FROM hostel_bed bed
         JOIN hostel_room r ON r.id = bed.room_id
         JOIN hostel_floor f ON f.id = r.floor_id
         JOIN hostel_block bl ON bl.id = f.block_id
         JOIN hostel h ON h.id = bl.hostel_id
         GROUP BY h.id, h.name
         ORDER BY h.name`,
      ),
      this.postgres.query<{ status: string; count: string }>(
        `SELECT status, count(*) AS count FROM inventory_item GROUP BY status`,
      ),
      this.libraryOverviewService.get(),
      this.approvalRequestRepo.countByState(),
      this.approvalRequestRepo.countByType(),
    ]);

    const studentStatusRow = studentStatusResult.rows[0];
    const staffTeachingRow = staffTeachingResult.rows[0];

    return {
      enrollment: {
        byGrade: gradeResult.rows.map((r) => ({ gradeName: r.gradeName, count: parseInt(r.count, 10) })),
        byGender: genderResult.rows.map((r) => ({ gender: r.gender, count: parseInt(r.count, 10) })),
        activeCount: parseInt(studentStatusRow.active, 10),
        inactiveCount: parseInt(studentStatusRow.inactive, 10),
      },
      staff: {
        byDesignation: designationResult.rows.map((r) => ({ designation: r.designation, count: parseInt(r.count, 10) })),
        teachingCount: parseInt(staffTeachingRow.teaching, 10),
        nonTeachingCount: parseInt(staffTeachingRow.non_teaching, 10),
      },
      attendance: {
        dailyPercentPresent: attendanceResult.rows.map((r) => ({
          date: r.date,
          percentPresent: Number(r.percent_present),
        })),
      },
      fees: {
        byState: feeStateCounts,
        totalOutstandingPaise: feeOverview.totalOutstandingPaise,
      },
      transport: {
        ridershipByRoute: ridershipResult.rows.map((r) => ({ routeName: r.routeName, count: parseInt(r.count, 10) })),
        vehiclesByStatus: vehicleStatusResult.rows.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
      },
      hostel: {
        occupancyByHostel: hostelOccupancyResult.rows.map((r) => ({
          hostelName: r.hostelName,
          occupied: parseInt(r.occupied, 10),
          vacant: parseInt(r.vacant, 10),
        })),
      },
      inventory: {
        byStatus: inventoryStatusResult.rows.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
      },
      library: {
        byStatus: [
          { status: 'AVAILABLE', count: libraryOverview.availableCopies },
          { status: 'ISSUED', count: libraryOverview.issuedCopies },
          { status: 'RESERVED', count: libraryOverview.reservedCopies },
          { status: 'OVERDUE', count: libraryOverview.overdueCount },
          { status: 'LOST', count: libraryOverview.lostCopies },
          { status: 'DAMAGED', count: libraryOverview.damagedCopies },
          { status: 'UNDER_REPAIR', count: libraryOverview.underRepairCopies },
          { status: 'RETIRED', count: libraryOverview.retiredCopies },
        ],
        outstandingFinesPaise: libraryOverview.pendingFinesAmountPaise,
      },
      requestsApprovals: {
        byState: requestStateCounts,
        byType: requestTypeCounts,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
