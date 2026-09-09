// Real health_profile (one row per student, height/weight/blood-group/family
// doctor) + infirmary_visit (the real nurse visit-log table -- NOT
// health_alert, which is auto-generated system-monitoring noise, confirmed by
// sampling real rows). Read-only: a Parent never writes either table.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface HealthProfileRow {
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  measuredOn: string | null;
  familyDoctor: string | null;
  doctorPhone: string | null;
  insuranceRef: string | null;
  notes: string | null;
}

export interface InfirmaryVisitRow {
  id: string;
  visitedAt: Date;
  complaint: string;
  vitals: Record<string, unknown> | null;
  observation: string | null;
  action: string;
  outcome: string | null;
  attendedByName: string;
  parentNotifiedAt: Date | null;
}

@Injectable()
export class ParentHealthRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getProfile(studentId: string, executor: Queryable = this.postgres): Promise<HealthProfileRow | null> {
    const { rows } = await executor.query(
      `SELECT blood_group, height_cm, weight_kg, measured_on, family_doctor, doctor_phone, insurance_ref, notes
       FROM health_profile WHERE student_id = $1`,
      [studentId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      bloodGroup: r.blood_group,
      heightCm: r.height_cm === null ? null : Number(r.height_cm),
      weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
      measuredOn: r.measured_on,
      familyDoctor: r.family_doctor,
      doctorPhone: r.doctor_phone,
      insuranceRef: r.insurance_ref,
      notes: r.notes,
    };
  }

  async findVisits(studentId: string, executor: Queryable = this.postgres): Promise<InfirmaryVisitRow[]> {
    const { rows } = await executor.query(
      `SELECT v.id, v.visited_at, v.complaint, v.vitals, v.observation, v.action, v.outcome, v.parent_notified_at,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS attended_by_name
       FROM infirmary_visit v
       JOIN person p ON p.id = v.attended_by
       WHERE v.student_id = $1
       ORDER BY v.visited_at DESC
       LIMIT 100`,
      [studentId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      visitedAt: r.visited_at,
      complaint: r.complaint,
      vitals: r.vitals,
      observation: r.observation,
      action: r.action,
      outcome: r.outcome,
      attendedByName: r.attended_by_name,
      parentNotifiedAt: r.parent_notified_at,
    }));
  }
}
