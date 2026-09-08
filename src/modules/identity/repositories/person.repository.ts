// Person read/write access. Started as a narrow auth-only view; extended for the
// Access (Identity, Roles & Assignments) module's person listing/creation/status needs.
// Full domain-specific person editing (student/staff subtype fields) still belongs to
// the Student Records / Faculty & Staff modules once they exist -- this stays scoped
// to the fields Identity/Access actually own.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface PersonAuthView {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  status: string;
  photoObjectKey: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface UpdatePersonInput {
  firstName?: string;
  lastName?: string | null;
  mobile?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export interface PersonWithRoles extends PersonAuthView {
  createdAt: Date;
  roleCodes: string[];
}

export interface CreatePersonInput {
  firstName: string;
  lastName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  mobile?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  createdBy: string;
}

export interface PersonListFilter {
  search?: string;
  roleCode?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface RawPersonRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  date_of_birth: string | null;
  gender: string | null;
  status: string;
  photo_object_key: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

function mapRow(row: RawPersonRow): PersonAuthView {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    mobile: row.mobile,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    status: row.status,
    photoObjectKey: row.photo_object_key,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
  };
}

const ROW_COLUMNS = `id, first_name, last_name, email, mobile, date_of_birth, gender, status,
  photo_object_key, address_line1, address_line2, city, state, pincode`;

@Injectable()
export class PersonRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findById(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<PersonAuthView | null> {
    const { rows } = await executor.query<RawPersonRow>(
      `SELECT ${ROW_COLUMNS}
       FROM person
       WHERE id = $1`,
      [personId],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  }

  async create(
    input: CreatePersonInput,
    executor: Queryable = this.postgres,
  ): Promise<PersonAuthView> {
    const { rows } = await executor.query<RawPersonRow>(
      `INSERT INTO person (first_name, last_name, date_of_birth, gender, mobile, email,
         address_line1, address_line2, city, state, pincode, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       RETURNING ${ROW_COLUMNS}`,
      [
        input.firstName,
        input.lastName ?? null,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.mobile ?? null,
        input.email ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.pincode ?? null,
        input.createdBy,
      ],
    );
    return mapRow(rows[0]);
  }

  /** Flips person.status -- ACTIVE, SUSPENDED, or ARCHIVED. This is what makes the
   * Identity module's "Deactivate" action actually block login (see
   * IdentityService.login's status check) rather than just being a cosmetic flag. */
  async updateStatus(
    personId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `UPDATE person SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
      [personId, status, updatedBy],
    );
  }

  /** Basic profile fields only (name/contact/DOB/gender) -- role/status/subtype data
   * stays owned by their own repositories (RoleAssignmentRepository, updateStatus
   * above, Student/Staff repositories once those exist). Uses COALESCE semantics like
   * every other PATCH in this codebase: an omitted field keeps its existing value,
   * it can't be explicitly cleared back to null this way -- same known limitation
   * noted elsewhere (Academic Master Data's PATCH endpoints, for one). That also means
   * this can never violate person_has_contact (mobile OR email must be set): it can
   * only add/replace a value, never null one out. */
  async update(
    personId: string,
    input: UpdatePersonInput,
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<PersonAuthView | null> {
    const { rows } = await executor.query<RawPersonRow>(
      `UPDATE person SET
         first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name),
         mobile = COALESCE($4, mobile),
         email = COALESCE($5, email),
         date_of_birth = COALESCE($6, date_of_birth),
         gender = COALESCE($7, gender),
         address_line1 = COALESCE($8, address_line1),
         address_line2 = COALESCE($9, address_line2),
         city = COALESCE($10, city),
         state = COALESCE($11, state),
         pincode = COALESCE($12, pincode),
         updated_by = $13,
         updated_at = now()
       WHERE id = $1
       RETURNING ${ROW_COLUMNS}`,
      [
        personId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.mobile ?? null,
        input.email ?? null,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.pincode ?? null,
        updatedBy,
      ],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  }

  /** Sets or clears (photoObjectKey: null) the storage key of the person's photo --
   * see PersonsController's photo endpoints, which own the actual file bytes. */
  async updatePhoto(
    personId: string,
    photoObjectKey: string | null,
    updatedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<PersonAuthView | null> {
    const { rows } = await executor.query<RawPersonRow>(
      `UPDATE person SET photo_object_key = $2, updated_by = $3, updated_at = now()
       WHERE id = $1
       RETURNING ${ROW_COLUMNS}`,
      [personId, photoObjectKey, updatedBy],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  }

  /** User-table listing: person + their currently active role codes, searchable by
   * name/email/mobile, filterable by role and status. */
  async findMany(
    filter: PersonListFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: PersonWithRoles[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      // Also matches login_identifier.value: most of this dataset's person rows have
      // null person.email/person.mobile (the login value lives only in
      // login_identifier), so searching just the person columns would miss almost
      // everyone.
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length}
          OR lower(coalesce(p.last_name, '')) LIKE $${params.length}
          OR lower(coalesce(p.email, '')) LIKE $${params.length}
          OR coalesce(p.mobile, '') LIKE $${params.length}
          OR EXISTS (SELECT 1 FROM login_identifier li WHERE li.person_id = p.id AND lower(li.value) LIKE $${params.length}))`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (filter.roleCode) {
      params.push(filter.roleCode);
      conditions.push(
        `EXISTS (SELECT 1 FROM v_active_role_assignment ra WHERE ra.person_id = p.id AND ra.role_code = $${params.length})`,
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM person p ${where}`,
      params,
    );

    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;
    const rowParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const rowsResult = await executor.query<RawPersonRow & { created_at: Date; role_codes: string[] }>(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.mobile, p.date_of_birth, p.gender,
              p.status, p.photo_object_key, p.address_line1, p.address_line2, p.city, p.state,
              p.pincode, p.created_at,
              COALESCE(
                array_agg(DISTINCT ra.role_code) FILTER (WHERE ra.role_code IS NOT NULL),
                '{}'
              ) AS role_codes
       FROM person p
       LEFT JOIN v_active_role_assignment ra ON ra.person_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY p.first_name, p.last_name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowParams,
    );

    return {
      total: parseInt(countResult.rows[0].count, 10),
      rows: rowsResult.rows.map((row) => ({
        ...mapRow(row),
        createdAt: row.created_at,
        roleCodes: row.role_codes,
      })),
    };
  }
}
