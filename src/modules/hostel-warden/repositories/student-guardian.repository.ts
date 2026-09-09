// Read-only guardian lookup for the Warden's Student Profile screen -- a narrow,
// hostel-warden-local copy of the same (student_id -> guardian_link -> person) join
// the People module's own GuardianLinkRepository.findByStudentId already does, per
// this codebase's established "narrow per-module repo" convention for identity
// lookups (see online-classes/messaging's own StaffRepository) rather than
// exporting/importing People's admin-facing repository here. Adds the guardian's
// own photo, which the People-module version doesn't carry.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrlSql } from '../../../infrastructure/storage/public-photo-url.util';

export interface StudentGuardianRow {
  personId: string;
  firstName: string;
  lastName: string | null;
  relationship: string;
  isPrimaryContact: boolean;
  mobile: string | null;
  photoUrl: string | null;
}

@Injectable()
export class StudentGuardianRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findActiveGuardians(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentGuardianRow[]> {
    const { rows } = await executor.query<StudentGuardianRow>(
      `SELECT p.id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName",
              g.relationship, g.is_primary_contact AS "isPrimaryContact", p.mobile,
              ${personPhotoPublicUrlSql('p.photo_object_key')} AS "photoUrl"
       FROM guardian_link g
       JOIN person p ON p.id = g.person_id
       WHERE g.student_id = $1 AND g.status = 'ACTIVE'
       ORDER BY g.is_primary_contact DESC, g.created_at`,
      [studentId],
    );
    return rows;
  }
}
