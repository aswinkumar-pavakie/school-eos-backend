import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from './common/audit/audit.module';
import { AuthGuard } from './common/auth/auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import configuration from './config/configuration';
import { jwtModuleFactory } from './config/jwt.config';
import { validate } from './config/validation.schema';
import { PostgresModule } from './infrastructure/postgres/postgres.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AcademicModule } from './modules/academic/academic.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DevicesModule } from './modules/devices/devices.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AdminFinanceModule } from './modules/finance/admin-finance.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HostelModule } from './modules/hostel/hostel.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LibraryModule } from './modules/library/library.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { PeopleModule } from './modules/people/people.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RequestsApprovalsModule } from './modules/requests-approvals/requests-approvals.module';
import { SportsModule } from './modules/sports/sports.module';
import { StaffAttendanceModule } from './modules/staff-attendance/staff-attendance.module';
import { TimetableModule } from './modules/timetable/timetable.module';
import { TransportModule } from './modules/transport/transport.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    // Registered here too (independently of IdentityModule's own registration) so
    // AuthGuard, provided as an APP_GUARD below, can inject JwtService from this
    // module's own scope.
    JwtModule.registerAsync(jwtModuleFactory),
    PostgresModule,
    StorageModule,
    AuditModule,
    IdentityModule,
    ApprovalsModule,
    FinanceModule,
    AdminFinanceModule,
    AdminModule,
    AcademicModule,
    PeopleModule,
    TransportModule,
    HostelModule,
    SportsModule,
    DevicesModule,
    DocumentsModule,
    DashboardModule,
    AttendanceModule,
    CommunitiesModule,
    AnnouncementsModule,
    TimetableModule,
    CalendarModule,
    StaffAttendanceModule,
    InventoryModule,
    MaintenanceModule,
    RequestsApprovalsModule,
    LibraryModule,
    ReportsModule,
  ],
  providers: [
    // Global guards, in order: AuthGuard resolves identity and sets request.user;
    // RolesGuard then checks it against @Roles(). Registered here — never attached
    // per-controller — so no new controller can ship without them.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
