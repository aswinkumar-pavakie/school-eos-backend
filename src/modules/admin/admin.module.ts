// Identity, Roles & Assignments (Admin's own module) — person listing/creation,
// role-assignment grant/revoke, generalized password reset, activate/deactivate,
// force sign-out, role permission preview, and the login-activity log.

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AdminIdentityController } from './admin-identity.controller';
import { AuditEventsController } from './audit-events.controller';
import { AuditLogController } from './audit-log.controller';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { RoleAssignmentsController } from './role-assignments.controller';
import { RoleAssignmentsService } from './role-assignments.service';
import { RolesController } from './roles.controller';
import { RoleRepository } from './repositories/role.repository';

// All Admin-facing backend features live here: person listing/creation, role
// grant/revoke, roles catalog, login-activity/audit read, and the admin-authorized
// parent password reset. Domain modules teammates build (student records, academic,
// transport, hostel, ...) stay separate -- this folder is specifically "what Admin's
// own panel calls," not "everything Admin happens to have permission on."
@Module({
  imports: [IdentityModule],
  controllers: [
    PersonsController,
    RoleAssignmentsController,
    RolesController,
    AuditEventsController,
    AuditLogController,
    AdminIdentityController,
  ],
  providers: [PersonsService, RoleAssignmentsService, RoleRepository],
  // PersonsService (activate/deactivate) and RoleAssignmentsService (grant/
  // revoke) back the "Administrative user/access request" effect in
  // RequestsApprovalsModule -- same cross-module pattern as everywhere else
  // in this codebase (import the module, inject its exported service).
  exports: [PersonsService, RoleAssignmentsService],
})
export class AdminModule {}
