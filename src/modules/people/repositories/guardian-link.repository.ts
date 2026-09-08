import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrlSql } from '../../../infrastructure/storage/public-photo-url.util';

export interface GuardianLinkRow {
  id: string;
  studentId: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  relationship: string;
  isPrimaryContact: boolean;
  accessLevel: string;
  isAuthorisedPickup: boolean;
  occupation: string | null;
  // bigint column -- node-pg returns this as a string to avoid precision loss.
  annualIncomePaise: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuardianLinkWithStudentRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  studentAdmissionNo: string;
  studentPhotoUrl: string | null;
  gradeName: string | null;
  sectionName: string | null;
  personId: string;
  relationship: string;
  isPrimaryContact: boolean;
  accessLevel: string;
  isAuthorisedPickup: boolean;
  occupation: string | null;
  annualIncomePaise: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGuardianLinkInput {
  studentId: string;
  personId: string;
  relationship: string;
  isPrimaryContact?: boolean;
  accessLevel?: string;
  isAuthorisedPickup?: boolean;
  occupation?: string | null;
  annualIncomePaise?: number | null;
}

export interface UpdateGuardianLinkInput {
  relationship?: string;
  accessLevel?: string;
  isAuthorisedPickup?: boolean;
  occupation?: string | null;
  annualIncomePaise?: number | null;
}

const COLUMNS = `g.id, g.student_id AS "studentId", g.person_id AS "personId",
  p.first_name AS "firstName", p.last_name AS "lastName", g.relationship,
  g.is_primary_contact AS "isPrimaryContact", g.access_level AS "accessLevel",
  g.is_authorised_pickup AS "isAuthorisedPickup", g.occupation,
  g.annual_income_paise AS "annualIncomePaise", g.status,
  g.created_at AS "createdAt", g.updated_at AS "updatedAt"`;

@Injectable()
export class GuardianLinkRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStudentId(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<GuardianLinkRow[]> {
    const { rows } = await executor.query<GuardianLinkRow>(
      `SELECT ${COLUMNS} FROM guardian_link g JOIN person p ON p.id = g.person_id
       WHERE g.student_id = $1 ORDER BY g.is_primary_contact DESC, g.created_at`,
      [studentId],
    );
    return rows;
  }

  /** Reverse of findByStudentId -- which children a given parent (person) is linked
   * to. Joins student + its own person row for display, since a guardian_link's
   * "identity" columns (firstName/lastName via COLUMNS) describe the *guardian*,
   * not the child. */
  async findByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<GuardianLinkWithStudentRow[]> {
    const { rows } = await executor.query<GuardianLinkWithStudentRow>(
      `SELECT g.id, g.student_id AS "studentId", sp.first_name AS "studentFirstName",
              sp.last_name AS "studentLastName", s.admission_no AS "studentAdmissionNo",
              ${personPhotoPublicUrlSql('sp.photo_object_key')} AS "studentPhotoUrl",
              g2.name AS "gradeName", sec.name AS "sectionName",
              g.person_id AS "personId", g.relationship,
              g.is_primary_contact AS "isPrimaryContact", g.access_level AS "accessLevel",
              g.is_authorised_pickup AS "isAuthorisedPickup", g.occupation,
              g.annual_income_paise AS "annualIncomePaise", g.status,
              g.created_at AS "createdAt", g.updated_at AS "updatedAt"
       FROM guardian_link g
       JOIN student s ON s.id = g.student_id
       JOIN person sp ON sp.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g2 ON g2.id = sec.grade_id
       WHERE g.person_id = $1
       ORDER BY g.created_at`,
      [personId],
    );
    return rows;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<GuardianLinkRow | null> {
    const { rows } = await executor.query<GuardianLinkRow>(
      `SELECT ${COLUMNS} FROM guardian_link g JOIN person p ON p.id = g.person_id WHERE g.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateGuardianLinkInput,
    executor: Queryable = this.postgres,
  ): Promise<GuardianLinkRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO guardian_link (student_id, person_id, relationship, is_primary_contact,
         access_level, is_authorised_pickup, occupation, annual_income_paise)
       VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, 'FULL'), COALESCE($6, true), $7, $8)
       RETURNING id`,
      [
        input.studentId,
        input.personId,
        input.relationship,
        input.isPrimaryContact ?? null,
        input.accessLevel ?? null,
        input.isAuthorisedPickup ?? null,
        input.occupation ?? null,
        input.annualIncomePaise ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdateGuardianLinkInput,
    executor: Queryable = this.postgres,
  ): Promise<GuardianLinkRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE guardian_link SET
         relationship = COALESCE($2, relationship),
         access_level = COALESCE($3, access_level),
         is_authorised_pickup = COALESCE($4, is_authorised_pickup),
         occupation = COALESCE($5, occupation),
         annual_income_paise = COALESCE($6, annual_income_paise),
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.relationship ?? null,
        input.accessLevel ?? null,
        input.isAuthorisedPickup ?? null,
        input.occupation ?? null,
        input.annualIncomePaise ?? null,
      ],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  /** Unsets any other ACTIVE primary contact for this student -- must run inside a
   * transaction alongside setPrimary, so the partial-unique index on
   * (student_id WHERE is_primary_contact AND status='ACTIVE') never sees two true rows. */
  async clearPrimaryForStudent(
    studentId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE guardian_link SET is_primary_contact = false
       WHERE student_id = $1 AND is_primary_contact = true`,
      [studentId],
    );
  }

  async setPrimary(
    id: string,
    executor: Queryable,
  ): Promise<GuardianLinkRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE guardian_link SET is_primary_contact = true, updated_at = now() WHERE id = $1 RETURNING id`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  async revoke(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<GuardianLinkRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE guardian_link SET status = 'REVOKED', is_primary_contact = false, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  async delete(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `DELETE FROM guardian_link WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}
