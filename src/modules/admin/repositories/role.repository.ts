// Read-only access to the fixed role catalog. There is no dynamic custom-permission
// system in this schema (no `permissions`/`role_permissions` tables) -- role_code is a
// closed set that role_assignment.role_code has a real FK to, and what each role can
// do is a fixed, hardcoded mapping (see ROLE_MODULE_ACCESS below), not something an
// Admin configures per-role.

import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../../infrastructure/postgres/postgres.service';

export interface RoleRow {
  code: string;
  name: string;
  isCoreLogin: boolean;
  description: string | null;
}

@Injectable()
export class RoleRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findAll(): Promise<RoleRow[]> {
    const { rows } = await this.postgres.query<{
      code: string;
      name: string;
      is_core_login: boolean;
      description: string | null;
    }>(`SELECT code, name, is_core_login, description FROM role ORDER BY name`);
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      isCoreLogin: row.is_core_login,
      description: row.description,
    }));
  }

  async exists(code: string): Promise<boolean> {
    const { rows } = await this.postgres.query(
      `SELECT 1 FROM role WHERE code = $1`,
      [code],
    );
    return rows.length > 0;
  }
}

/**
 * Which sidebar modules a role_code unlocks -- the "Role permission preview" screen's
 * data source. Static because access in this product is fixed-by-role (see the
 * Design Architecture doc's capability matrix), not a configurable permission builder.
 * Update this alongside any new role_code added to the `role` table.
 */
export const ROLE_MODULE_ACCESS: Record<string, string[]> = {
  ADMIN: [
    'Dashboard',
    'Identity, Roles & Assignments',
    'Student Records',
    'Parent & Guardian',
    'Faculty & Staff',
    'Academic Configuration',
    'Communities',
    'Transport',
    'Hostel',
    'Sports',
    'Announcements',
    'Reports & Analytics',
    'Settings, Master Data & Audit',
  ],
  PRINCIPAL: [
    'Dashboard',
    'Timetable & Substitution',
    'Attendance',
    'Assessment & Examination',
    'Announcements',
    'Reports & Analytics',
    'Audit',
  ],
  VICE_PRINCIPAL: [
    'Dashboard',
    'Timetable & Substitution',
    'Attendance',
    'Assessment & Examination',
  ],
  FINANCE: ['Dashboard', 'Finance & Fees', 'Payroll', 'Reports & Analytics'],
  FACULTY: [
    'Dashboard',
    'Attendance',
    'Homework & LMS',
    'Assessment & Examination',
  ],
  ACADEMIC_COORDINATOR: ['Assessment & Examination (verification)'],
  CLASS_ADVISOR: [
    'Student Records (own section)',
    'Timetable & Substitution (own section)',
  ],
  COMMUNITY_INCHARGE: ['Communities (own community)'],
  HEALTH_INCHARGE: ['Health & Infirmary'],
  SPORTS_FACULTY: ['Sports (own team)'],
  PARENT: [
    'Dashboard',
    'Attendance',
    'Homework & LMS',
    'Finance & Fees',
    'Transport',
  ],
  HOSTEL_WARDEN: ['Hostel'],
  TRANSPORT_MANAGER: ['Dashboard', 'Transport', 'Reports & Analytics'],
  BUS_ATTENDANT: ['Transport (device, boarding only)'],
  CANTEEN_VENDOR: ['Finance & Fees (device, wallet sales only)'],
  MEDIA_ROOM: [
    'Dashboard',
    'Social Media Publishing',
    'Shoot Assignments',
    'Inventory (Media & AV Equipment)',
    'Raise Indent',
    'Media Team',
  ],
};
