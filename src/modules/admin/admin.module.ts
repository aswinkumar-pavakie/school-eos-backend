// Identity, Roles & Assignments (Admin's own module) — person listing/creation,
// role-assignment grant/revoke, generalized password reset, activate/deactivate,
// force sign-out, role permission preview, and the login-activity log.

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AcademicModule } from '../academic/academic.module';
import { PeopleModule } from '../people/people.module';
import { AdminIdentityController } from './admin-identity.controller';
import { AuditEventsController } from './audit-events.controller';
import { AuditLogController } from './audit-log.controller';
import { ClassTeacherLoginController } from './class-teacher-login.controller';
import { ClassTeacherLoginService } from './class-teacher-login.service';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { RoleAssignmentsController } from './role-assignments.controller';
import { RoleAssignmentsService } from './role-assignments.service';
import { RolesController } from './roles.controller';
import { RoleRepository } from './repositories/role.repository';
import { AcademicCoordinatorLoginRepository } from './repositories/academic-coordinator-login.repository';
import { ClassTeacherLoginRepository } from './repositories/class-teacher-login.repository';

// All Admin-facing backend features live here: person listing/creation, role
// grant/revoke, roles catalog, login-activity/audit read, and the admin-authorized
// parent password reset. Domain modules teammates build (student records, academic,
// transport, hostel, ...) stay separate -- this folder is specifically "what Admin's
// own panel calls," not "everything Admin happens to have permission on."
@Module({
  imports: [IdentityModule, AcademicModule, PeopleModule],
  controllers: [
    PersonsController,
    RoleAssignmentsController,
    RolesController,
    AuditEventsController,
    AuditLogController,
    AdminIdentityController,
    ClassTeacherLoginController,
  ],
  providers: [
    PersonsService,
    RoleAssignmentsService,
    RoleRepository,
    AcademicCoordinatorLoginRepository,
    ClassTeacherLoginRepository,
    ClassTeacherLoginService,
  ],
  // PersonsService (activate/deactivate) and RoleAssignmentsService (grant/
  // revoke) back the "Administrative user/access request" effect in
  // RequestsApprovalsModule -- same cross-module pattern as everywhere else
  // in this codebase (import the module, inject its exported service).
  // ClassTeacherLoginService additionally backs Faculty's own "can I
  // switch to my Class Teacher login?" check (see faculty-scope.controller.ts).
  exports: [PersonsService, RoleAssignmentsService, ClassTeacherLoginService],
})
export class AdminModule {}
