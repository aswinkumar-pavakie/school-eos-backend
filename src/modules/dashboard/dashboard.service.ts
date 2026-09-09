// Read-only cross-module aggregation for the Admin dashboard. Deliberately its own
// small set of count queries rather than importing every other module's repository --
// a dashboard summary is inherently cross-cutting, and every query here is a plain
// read (no writes), so there's no "authoritative repository" being duplicated.

import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';

// Routine session events -- real, but not "administrative activity" in the sense
// an admin reviewing the dashboard cares about. Excluded from the feed here only;
// GET /audit-events (the full trail) still shows everything.
const ROUTINE_ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILURE'];

export interface DashboardSummary {
  activeStudents: number;
  activeStaff: number;
  currentAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  hostelOccupancy: { occupiedBeds: number; totalBeds: number };
  sectionsCount: number;
  subjectsCount: number;
  vehiclesCount: number;
  activeRoutesCount: number;
  activeSportsCount: number;
  idCardsIssuedCount: number;
  actionItems: { label: string; count: number; href: string }[];
  recentActivity: {
    id: string;
    action: string;
    objectType: string;
    outcome: string;
    occurredAt: Date;
    actorName: string | null;
    detail: string | null;
  }[];
  generatedAt: string;
}

/** Pulls a human-readable detail string out of an audit row's own before/after
 * JSON. Every action this codebase writes itself follows one of a few shapes
 * (a plain named entity, or a person + subtype composite from a two-step
 * create) -- this covers those generically rather than hardcoding all ~100
 * action types. Rows from outside this codebase (the concurrent external
 * activity flagged earlier in this project) won't match anything here and
 * fall back to null -- never invented. */
function describeActivity(
  afterData: unknown,
  beforeData: unknown,
): string | null {
  const data = (afterData ?? beforeData) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return null;

  const person = (data.person ??
    (typeof data.firstName === 'string' ? data : null)) as Record<
    string,
    unknown
  > | null;
  if (person && typeof person.firstName === 'string') {
    const name = [person.firstName, person.lastName].filter(Boolean).join(' ');
    const extra =
      data.admissionNo ?? data.employeeNo ?? data.registrationNo ?? null;
    return extra ? `${name} (${extra})` : name || null;
  }
  if (typeof data.name === 'string') return data.name;
  if (typeof data.registrationNo === 'string') return data.registrationNo;
  if (typeof data.cardUid === 'string') return data.cardUid;
  if (typeof data.code === 'string') return data.code;
  if (typeof data.employeeNo === 'string') return data.employeeNo;
  if (typeof data.admissionNo === 'string') return data.admissionNo;

  // Attendance rows carry no name of their own (no join at write-time) --
  // date/status is the next-best real detail rather than nothing.
  const record = (data.record ?? data) as Record<string, unknown>;
  if (typeof record.status === 'string' && typeof record.reason === 'string') {
    return `${record.status} — ${record.reason}`;
  }
  if (typeof record.status === 'string') return record.status;
  if (typeof data.sessionDate === 'string') {
    const rosterSize =
      typeof data.rosterSize === 'number'
        ? `, ${data.rosterSize} students`
        : '';
    return `${data.sessionDate.slice(0, 10)}${rosterSize}`;
  }
  if (typeof data.isLocked === 'boolean')
    return data.isLocked ? 'Locked' : 'Unlocked';

  return null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly postgres: PostgresService) {}

  async getSummary(): Promise<DashboardSummary> {
    const [
      studentsResult,
      staffResult,
      yearResult,
      bedsResult,
      sectionsResult,
      subjectsResult,
      studentsWithoutGuardianResult,
      studentsWithoutIdCardResult,
      draftFeeStructuresResult,
      vehiclesResult,
      activeRoutesResult,
      activeSportsResult,
      idCardsIssuedResult,
      activityResult,
    ] = await Promise.all([
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
      this.postgres.query<{ total: string; occupied: string }>(
        `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'OCCUPIED') AS occupied FROM hostel_bed`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM section WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM subject WHERE status = 'ACTIVE'`,
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
        `SELECT count(*) FROM fee_structure WHERE state = 'DRAFT'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM vehicle WHERE operational_status != 'RETIRED'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM route WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM sport WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{ count: string }>(
        `SELECT count(*) FROM id_card WHERE status = 'ACTIVE'`,
      ),
      this.postgres.query<{
        id: string;
        action: string;
        object_type: string;
        outcome: string;
        occurred_at: Date;
        actor_first_name: string | null;
        actor_last_name: string | null;
        after_data: unknown;
        before_data: unknown;
      }>(
        `SELECT ae.id, ae.action, ae.object_type, ae.outcome, ae.occurred_at,
                p.first_name AS actor_first_name, p.last_name AS actor_last_name,
                ae.after_data, ae.before_data
         FROM audit_event ae
         LEFT JOIN person p ON p.id = ae.actor_person_id
         WHERE ae.action NOT IN (${ROUTINE_ACTIONS.map((_, i) => `$${i + 1}`).join(', ')})
         ORDER BY ae.occurred_at DESC
         LIMIT 8`,
        ROUTINE_ACTIONS,
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
      hostelOccupancy: {
        occupiedBeds: parseInt(bedsResult.rows[0].occupied, 10),
        totalBeds: parseInt(bedsResult.rows[0].total, 10),
      },
      sectionsCount: parseInt(sectionsResult.rows[0].count, 10),
      subjectsCount: parseInt(subjectsResult.rows[0].count, 10),
      vehiclesCount: parseInt(vehiclesResult.rows[0].count, 10),
      activeRoutesCount: parseInt(activeRoutesResult.rows[0].count, 10),
      activeSportsCount: parseInt(activeSportsResult.rows[0].count, 10),
      idCardsIssuedCount: parseInt(idCardsIssuedResult.rows[0].count, 10),
      actionItems: [
        {
          label: 'Active students with no guardian on file',
          count: parseInt(studentsWithoutGuardianResult.rows[0].count, 10),
          href: '/dashboard/students',
        },
        {
          label: 'Active students with no ID card issued',
          count: parseInt(studentsWithoutIdCardResult.rows[0].count, 10),
          href: '/dashboard/students',
        },
        {
          label: 'Fee structures still in draft',
          count: parseInt(draftFeeStructuresResult.rows[0].count, 10),
          href: '/dashboard/finance',
        },
      ],
      recentActivity: activityResult.rows.map((row) => ({
        id: row.id,
        action: row.action,
        objectType: row.object_type,
        outcome: row.outcome,
        occurredAt: row.occurred_at,
        actorName: row.actor_first_name
          ? [row.actor_first_name, row.actor_last_name]
              .filter(Boolean)
              .join(' ')
          : null,
        detail: describeActivity(row.after_data, row.before_data),
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}
