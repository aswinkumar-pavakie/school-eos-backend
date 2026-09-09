// Parent & Guardian. A "parent" isn't a separate entity in this schema -- it's a
// person holding an active PARENT role_assignment, linked to students via
// guardian_link. Creating one goes through admin/'s existing POST /persons (person +
// login + role assignment together); this module only adds what that flow can't
// already do: listing parents (with a children count) and looking up which children
// a given parent is linked to. Person -> Student -> Guardian is the write-side
// dependency chain (people/students.service.ts); this is its read-side counterpart
// from the guardian's own side.

import { Injectable, NotFoundException } from '@nestjs/common';
import { LoginIdentifierRepository } from '../identity/repositories/login-identifier.repository';
import { PersonRepository } from '../identity/repositories/person.repository';
import { UserCredentialRepository } from '../identity/repositories/user-credential.repository';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrl } from '../../infrastructure/storage/public-photo-url.util';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';

export interface ParentQuery {
  search?: string;
  status?: string;
  ids?: string;
  page?: number;
  limit?: number;
}

export interface ParentListRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  status: string;
  childrenCount: number;
  photoUrl: string | null;
  occupation: string | null;
}

@Injectable()
export class ParentsService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly personRepo: PersonRepository,
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly loginIdentifierRepo: LoginIdentifierRepository,
    private readonly userCredentialRepo: UserCredentialRepository,
  ) {}

  async list(query: ParentQuery) {
    const page = query.page ?? 1;
    const ids = query.ids
      ? query.ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    // An explicit id selection must never be truncated by the default page
    // size -- it's a hand-picked set (e.g. checkbox selection), not a browse.
    const limit = ids
      ? Math.max(ids.length, 1)
      : Math.min(query.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const conditions = [
      `EXISTS (SELECT 1 FROM v_active_role_assignment ra WHERE ra.person_id = p.id AND ra.role_code = 'PARENT')`,
    ];
    const params: unknown[] = [];

    if (ids && ids.length > 0) {
      params.push(ids);
      conditions.push(`p.id = ANY($${params.length}::uuid[])`);
    }

    if (query.status) {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length}
          OR lower(coalesce(p.last_name, '')) LIKE $${params.length}
          OR lower(coalesce(p.email, '')) LIKE $${params.length}
          OR coalesce(p.mobile, '') LIKE $${params.length}
          OR EXISTS (SELECT 1 FROM login_identifier li WHERE li.person_id = p.id AND lower(li.value) LIKE $${params.length}))`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM person p ${where}`,
      params,
    );

    const rowParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const rowsResult = await this.postgres.query<{
      id: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      mobile: string | null;
      status: string;
      photo_object_key: string | null;
      children_count: string;
      occupations: string | null;
    }>(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.mobile, p.status, p.photo_object_key,
              count(gl.id) FILTER (WHERE gl.status = 'ACTIVE') AS children_count,
              string_agg(DISTINCT gl.occupation, ', ') FILTER (WHERE gl.occupation IS NOT NULL) AS occupations
       FROM person p
       LEFT JOIN guardian_link gl ON gl.person_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY p.first_name, p.last_name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowParams,
    );

    const rows: ParentListRow[] = rowsResult.rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      mobile: row.mobile,
      status: row.status,
      childrenCount: parseInt(row.children_count, 10),
      photoUrl: row.photo_object_key
        ? personPhotoPublicUrl(row.photo_object_key)
        : null,
      occupation: row.occupations,
    }));

    return {
      data: rows,
      meta: { page, limit, total: parseInt(countResult.rows[0].count, 10) },
    };
  }

  async get(id: string) {
    const person = await this.personRepo.findById(id);
    if (!person) throw new NotFoundException('Parent record not found');

    const { rows } = await this.postgres.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM v_active_role_assignment WHERE person_id = $1 AND role_code = 'PARENT'
       ) AS exists`,
      [id],
    );
    if (!rows[0].exists) throw new NotFoundException('Parent record not found');

    const [children, loginIdentifiers, credential] = await Promise.all([
      this.guardianLinkRepo.findByPersonId(id),
      this.loginIdentifierRepo.findByPersonId(id),
      this.userCredentialRepo.findByPersonId(id),
    ]);
    return {
      ...person,
      photoUrl: person.photoObjectKey
        ? personPhotoPublicUrl(person.photoObjectKey)
        : null,
      children,
      loginIdentifiers,
      // Only meaningful for a Parent (the only role with a self-service reset
      // allowance to begin with) -- true once they've used their one free
      // self-reset, meaning any *further* "forgot password" needs an admin reset.
      resetAllowanceUsed: credential?.resetAllowanceUsed ?? false,
    };
  }
}
