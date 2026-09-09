import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
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
import { HostelWardenModule } from './modules/hostel-warden/hostel-warden.module';
import { HostelWardenPendingModule } from './modules/hostel-warden/hostel-warden-pending.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { MediaModule } from './modules/media/media.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { OnlineClassesModule } from './modules/online-classes/online-classes.module';
import { ParentModule } from './modules/parent/parent.module';
import { PeopleModule } from './modules/people/people.module';
import { RequestsApprovalsModule } from './modules/requests-approvals/requests-approvals.module';
import { SportsModule } from './modules/sports/sports.module';
import { StaffAttendanceModule } from './modules/staff-attendance/staff-attendance.module';
import { StudentEventsModule } from './modules/student-events/student-events.module';
import { TimetableModule } from './modules/timetable/timetable.module';
import { TransportModule } from './modules/transport/transport.module';
import { TransportOpsModule } from './modules/transport-ops/transport-ops.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    // Media Room's scheduled-post auto-publish is the one consumer today (see
    // MediaPostsScheduler) — a single @Cron job, not a queue/worker system.
    ScheduleModule.forRoot(),
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
    ParentModule,
    AdminModule,
    AcademicModule,
    PeopleModule,
    TransportModule,
    TransportOpsModule,
    HostelModule,
    HostelWardenModule,
    HostelWardenPendingModule,
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
    OnlineClassesModule,
    MessagingModule,
    MediaModule,
    StudentEventsModule,
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
