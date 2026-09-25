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
import { InventoryItemsService } from '../inventory/inventory-items.service';
import { RepairRequestsService } from '../maintenance/repair-requests.service';
import { LibraryOverviewService } from '../library/library-overview.service';
import { SportsAdminOverviewService } from '../sports/sports-admin-overview.service';
import { VehiclesService } from '../transport/vehicles.service';

export interface PrincipalDashboardSummary {
  activeStudents: number;
  activeStaff: number;
  currentAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  // Design-reframe additions (per the SIS Principal mockup's 8-card dashboard
  // KPI row) -- same real, already-populated tables Admin's own dashboard
  // summary queries (dashboard.service.ts), just re-read here rather than
  // reshaping that service's own response for a different role.
  parentLoginsIssued: { issued: number; totalFamilies: number };
  hostelOccupancy: { occupiedBeds: number; totalBeds: number };
  vehiclesCount: number;
  subjectsCount: number;
  staffMarkedToday: { present: number; absent: number; onLeave: number; total: number };
  needsAttention: { label: string; sub: string; count: number }[];
  // Pixel-reframe addition: real second detail lines for the KPI cards (per
  // the actual mockup screenshot, not the earlier text-only spec) -- staff.
  // is_teaching and student.is_hosteller are real columns already in the
  // schema, just not read here before.
  staffSplit: { teaching: number; support: number };
  studentResidence: { hostellers: number; dayScholars: number };
  activeSectionsCount: number;
  // Correspondent Phase 5 addition -- real operational KPIs for the six
  // school-operations modules (Transport/Hostel already covered above by
  // vehiclesCount/hostelOccupancy). Each figure is read straight from that
  // module's own existing overview service, not a new duplicate query.
  inventoryLowStockCount: number;
  inventoryDamagedCount: number;
  maintenanceOpenRequestsCount: number;
  sportsUpcomingFixturesCount: number;
  libraryOverdueCount: number;
  // Correspondent Phase 8 addition -- real vehicle_document/driver_document
  // expiry counts, straight from VehiclesService.complianceSummary() (already
  // backs Transport's own "Docs to renew" KPI) -- no new query.
  complianceExpiringCount: number;
  complianceOverdueCount: number;
  generatedAt: string;
}

@Injectable()
export class PrincipalDashboardService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly inventoryItemsService: InventoryItemsService,
    private readonly repairRequestsService: RepairRequestsService,
    private readonly libraryOverviewService: LibraryOverviewService,
    private readonly sportsAdminOverviewService: SportsAdminOverviewService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async getSummary(): Promise<PrincipalDashboardSummary> {
    const [
      studentsResult,
      staffResult,
      yearResult,
      parentLoginsResult,
      bedsResult,
      vehiclesResult,
      subjectsResult,
      staffMarkedResult,
      noGuardianResult,
      noIdCardResult,
      unadvisedSectionsResult,
      staffSplitResult,
      studentResidenceResult,
      activeSectionsResult,
      inventoryOverview,
      maintenanceOverview,
      libraryOverview,
      sportsOverview,
      complianceSummary,
    ] = await Promise.all([
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM student WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        // Same class-teacher-login exclusion as the staffSplit query below and
        // dashboard.service.ts's own activeStaff count -- this headline total
        // was the one place that still counted the 56 synthetic per-section
        // rows, so it disagreed with its own now-fixed teaching/support
        // breakdown (212 here vs 110+46=156 in the breakdown).
        `SELECT count(*) FROM staff s
         WHERE s.status = 'ACTIVE'
           AND NOT EXISTS (SELECT 1 FROM class_teacher_login ctl WHERE ctl.login_person_id = s.person_id)`,
      ),
      this.postgres.query<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
      }>(
        `SELECT id, name, start_date, end_date FROM academic_year WHERE is_current LIMIT 1`,
      ),
      this.postgres.query<{ total: string; issued: string }>(
        `SELECT count(DISTINCT p.id) AS total,
                count(DISTINCT p.id) FILTER (WHERE EXISTS (
                  SELECT 1 FROM login_identifier li WHERE li.person_id = p.id
                )) AS issued
         FROM person p
         WHERE EXISTS (
           SELECT 1 FROM v_active_role_assignment ra
           WHERE ra.person_id = p.id AND ra.role_code = 'PARENT'
         )`,
      ),
      this.postgres.query<{ total: string; occupied: string }>(
        `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'OCCUPIED') AS occupied FROM hostel_bed`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM vehicle WHERE operational_status != 'RETIRED'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM subject WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ present: string; absent: string; on_leave: string }>(
        `SELECT
           count(*) FILTER (WHERE latest.status = 'CHECK_IN') AS present,
           count(*) FILTER (WHERE latest.status = 'ABSENT') AS absent,
           count(*) FILTER (WHERE latest.status = 'ON_DUTY') AS on_leave
         FROM staff s
         LEFT JOIN LATERAL (
           SELECT event_type AS status
           FROM staff_attendance_event e
           WHERE e.staff_id = s.id AND e.occurred_at::date = CURRENT_DATE
           ORDER BY e.received_at DESC
           LIMIT 1
         ) latest ON true
         WHERE s.status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM student s
         WHERE s.status = 'ACTIVE'
           AND NOT EXISTS (
             SELECT 1 FROM guardian_link gl WHERE gl.student_id = s.id AND gl.status = 'ACTIVE'
           )`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM student s
         WHERE s.status = 'ACTIVE'
           AND NOT EXISTS (
             SELECT 1 FROM id_card ic WHERE ic.student_id = s.id AND ic.status = 'ACTIVE'
           )`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM section sec
         WHERE sec.status = 'ACTIVE'
           AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
           AND NOT EXISTS (
             SELECT 1 FROM role_assignment ra
             WHERE ra.scope_id = sec.id AND ra.scope_type = 'SECTION'
               AND ra.role_code = 'CLASS_ADVISOR' AND ra.status = 'ACTIVE'
           )`,
      ),
      this.postgres.query<{ teaching: string; support: string }>(
        // Excludes class-teacher-login's own synthetic staff row (advisor
        // lookups need one; it's not a real employee), the same exclusion
        // dashboard.service.ts's own activeStaff count and
        // staff.repository.ts's own findMany() already apply -- this query
        // was the one place in the codebase missing it, inflating the total
        // by exactly one row per section (confirmed live: 212 shown here vs
        // 156 real employees, 56 sections).
        `SELECT count(*) FILTER (WHERE is_teaching) AS teaching,
                count(*) FILTER (WHERE NOT is_teaching) AS support
         FROM staff st
         WHERE st.status = 'ACTIVE'
           AND NOT EXISTS (SELECT 1 FROM class_teacher_login ctl WHERE ctl.login_person_id = st.person_id)`,
      ),
      this.postgres.query<{ hostellers: string; day_scholars: string }>(
        `SELECT count(*) FILTER (WHERE is_hosteller) AS hostellers,
                count(*) FILTER (WHERE NOT is_hosteller) AS day_scholars
         FROM student WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM section
         WHERE status = 'ACTIVE'
           AND academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)`,
      ),
      this.inventoryItemsService.overview(),
      this.repairRequestsService.overview(),
      this.libraryOverviewService.get(),
      this.sportsAdminOverviewService.getOverview(),
      this.vehiclesService.complianceSummary(),
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
      parentLoginsIssued: {
        issued: parseInt(parentLoginsResult.rows[0].issued, 10),
        totalFamilies: parseInt(parentLoginsResult.rows[0].total, 10),
      },
      hostelOccupancy: {
        occupiedBeds: parseInt(bedsResult.rows[0].occupied, 10),
        totalBeds: parseInt(bedsResult.rows[0].total, 10),
      },
      vehiclesCount: parseInt(vehiclesResult.rows[0].count, 10),
      subjectsCount: parseInt(subjectsResult.rows[0].count, 10),
      staffMarkedToday: {
        present: parseInt(staffMarkedResult.rows[0].present, 10),
        absent: parseInt(staffMarkedResult.rows[0].absent, 10),
        onLeave: parseInt(staffMarkedResult.rows[0].on_leave, 10),
        total: parseInt(staffResult.rows[0].count, 10),
      },
      needsAttention: [
        {
          label: 'Students with no guardian on file',
          sub: 'Admission files incomplete',
          count: parseInt(noGuardianResult.rows[0].count, 10),
        },
        {
          label: 'Students with no ID card issued',
          sub: 'Photograph pending upload',
          count: parseInt(noIdCardResult.rows[0].count, 10),
        },
        {
          label: 'Sections with no class advisor assigned',
          sub: 'Current academic year',
          count: parseInt(unadvisedSectionsResult.rows[0].count, 10),
        },
      ],
      staffSplit: {
        teaching: parseInt(staffSplitResult.rows[0].teaching, 10),
        support: parseInt(staffSplitResult.rows[0].support, 10),
      },
      studentResidence: {
        hostellers: parseInt(studentResidenceResult.rows[0].hostellers, 10),
        dayScholars: parseInt(studentResidenceResult.rows[0].day_scholars, 10),
      },
      activeSectionsCount: parseInt(activeSectionsResult.rows[0].count, 10),
      inventoryLowStockCount: inventoryOverview.lowStock,
      inventoryDamagedCount: inventoryOverview.damaged,
      maintenanceOpenRequestsCount:
        maintenanceOverview.requested + maintenanceOverview.assigned + maintenanceOverview.inProgress,
      sportsUpcomingFixturesCount: sportsOverview.totals.upcomingFixtures,
      libraryOverdueCount: libraryOverview.overdueCount,
      complianceExpiringCount: complianceSummary.expiring,
      complianceOverdueCount: complianceSummary.overdue,
      generatedAt: new Date().toISOString(),
    };
  }
}
