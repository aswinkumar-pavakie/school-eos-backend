// Attendance Diary -- read-only, per-day view of student and employee attendance.
//
// SECURITY MODEL (this is sensitive data about children and staff):
//  * Who may see what is decided HERE, on the server, from role_assignment on every call --
//    never from the JWT's role list alone, never from anything the client sends.
//  * Leadership (ADMIN / CORRESPONDENT / PRINCIPAL / VICE_PRINCIPAL): whole school.
//  * ACADEMIC_COORDINATOR: only the classes in their assigned grade / stage scope, and only
//    the employees who teach or advise in those classes (never principal / vice principal).
//  * CLASS_ADVISOR: only their own class; students only.
//  * FACULTY: only the classes where they actually teach; students only.
//  * Client filters can only NARROW inside that scope (they are AND-ed with it); asking for a
//    class outside your scope returns nothing, not someone else's data.
//  * Every read is written to the audit trail; forbidden attempts are recorded as DENIED.
//  * Responses carry only what the screen needs (no contact details, no guardian data).

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { toOffsetLimit } from '../../common/pagination/pagination.util';
import {
  DiaryContextQueryDto,
  EmployeeDiaryQueryDto,
  StudentDiaryQueryDto,
} from './dto/attendance-diary-query.dto';
import { AttendanceDiaryRepository } from './repositories/attendance-diary.repository';

const LEADERSHIP_ROLES = [
  'ADMIN',
  'CORRESPONDENT',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
];
const ROLE_PRIORITY = [
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'ADMIN',
  'CORRESPONDENT',
  'ACADEMIC_COORDINATOR',
  'CLASS_ADVISOR',
  'FACULTY',
];
const ROLE_LABEL: Record<string, string> = {
  PRINCIPAL: 'Principal',
  VICE_PRINCIPAL: 'Vice Principal',
  ADMIN: 'Administrator',
  CORRESPONDENT: 'Correspondent',
  ACADEMIC_COORDINATOR: 'Academic Coordinator',
  CLASS_ADVISOR: 'Class Advisor',
  FACULTY: 'Faculty',
};

export interface DiaryAccess {
  kind: 'FULL' | 'SCOPED';
  primaryRole: string;
  roleLabel: string;
  /** null = whole school. Otherwise the ONLY sections this caller may ever read. */
  sectionIds: string[] | null;
  canViewEmployees: boolean;
  /** Coordinators never see principal / vice principal attendance. */
  excludeLeadership: boolean;
  /** FULL = leadership may open the school's full student profile. ATTENDANCE = everyone else
   * gets the limited, attendance-only profile (no fees, no guardian details). */
  profileMode: 'FULL' | 'ATTENDANCE';
}

export interface ReadMeta {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

/** Today's calendar date in the school's timezone (IST), as YYYY-MM-DD. */
export function todayInSchoolTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function assertValidDiaryDate(date: string, today: string): void {
  const t = Date.parse(`${date}T00:00:00Z`);
  const valid =
    Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
  if (!valid || date < '2000-01-01') {
    throw new BadRequestException('Invalid date.');
  }
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 366 * 86400000)
    .toISOString()
    .slice(0, 10);
  if (date > limit)
    throw new BadRequestException('Date is too far in the future.');
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

@Injectable()
export class AttendanceDiaryService {
  private readonly logger = new Logger(AttendanceDiaryService.name);

  constructor(
    private readonly repo: AttendanceDiaryRepository,
    private readonly audit: AuditService,
  ) {}

  /** Resolve what this exact caller may see, from the database, right now. */
  async resolveAccess(personId: string): Promise<DiaryAccess> {
    const roles = await this.repo.getActiveRoleCodes(personId);
    const primaryRole =
      ROLE_PRIORITY.find((r) => roles.includes(r)) ?? roles[0] ?? 'UNKNOWN';

    if (roles.some((r) => LEADERSHIP_ROLES.includes(r))) {
      return {
        kind: 'FULL',
        primaryRole,
        roleLabel: ROLE_LABEL[primaryRole] ?? primaryRole,
        sectionIds: null,
        canViewEmployees: true,
        excludeLeadership: false,
        profileMode: 'FULL',
      };
    }

    const isCoordinator = roles.includes('ACADEMIC_COORDINATOR');
    const isAdvisor = roles.includes('CLASS_ADVISOR');
    const isFaculty = roles.includes('FACULTY');
    if (!isCoordinator && !isAdvisor && !isFaculty) {
      throw new ForbiddenException(
        'You do not have access to the Attendance Diary.',
      );
    }

    const sections = new Set<string>();
    if (isCoordinator) {
      const rows = await this.repo.getCoordinatorScopeRows(personId);
      const schoolWide = rows.some((r) => r.scopeType === 'SCHOOL');
      const stages = rows
        .filter((r) => r.scopeType === 'STAGE' && r.scopeStage)
        .map((r) => r.scopeStage as string);
      const gradeIds = rows
        .filter((r) => r.scopeType === 'GRADE' && r.scopeId)
        .map((r) => r.scopeId as string);
      for (const id of await this.repo.sectionIdsForGradeScope(
        gradeIds,
        stages,
        schoolWide,
      ))
        sections.add(id);
    }
    if (isAdvisor) {
      for (const id of await this.repo.advisorSectionIds(personId))
        sections.add(id);
    }
    if (isFaculty) {
      for (const id of await this.repo.teachingSectionIds(personId))
        sections.add(id);
      for (const id of await this.repo.seatHolderSectionIds(personId))
        sections.add(id);
    }

    return {
      kind: 'SCOPED',
      primaryRole,
      roleLabel: ROLE_LABEL[primaryRole] ?? primaryRole,
      sectionIds: [...sections],
      canViewEmployees: isCoordinator,
      excludeLeadership: true,
      profileMode: 'ATTENDANCE',
    };
  }

  async getContext(personId: string, query: DiaryContextQueryDto) {
    const access = await this.resolveAccess(personId);
    const today = todayInSchoolTz();
    const date = query.date ?? today;
    assertValidDiaryDate(date, today);
    const [year, options, departments] = await Promise.all([
      this.repo.getCurrentYear(),
      this.repo.listClassOptions(access.sectionIds),
      access.canViewEmployees
        ? this.repo.listDepartments()
        : Promise.resolve([]),
    ]);

    const grades = new Map<
      string,
      { id: string; name: string; levelNo: number; stage: string }
    >();
    const sections: {
      id: string;
      gradeId: string;
      gradeName: string;
      name: string;
    }[] = [];
    for (const o of options) {
      grades.set(o.gradeId, {
        id: o.gradeId,
        name: o.gradeName,
        levelNo: o.levelNo,
        stage: o.stage,
      });
      sections.push({
        id: o.sectionId,
        gradeId: o.gradeId,
        gradeName: o.gradeName,
        name: o.sectionName,
      });
    }
    return {
      today,
      date,
      academicYear: year,
      access: {
        kind: access.kind,
        role: access.primaryRole,
        roleLabel: access.roleLabel,
        canViewEmployees: access.canViewEmployees,
        profileMode: access.profileMode,
        classCount: sections.length,
      },
      grades: [...grades.values()],
      sections,
      departments,
    };
  }

  async listStudents(
    personId: string,
    query: StudentDiaryQueryDto,
    meta: ReadMeta = {},
  ) {
    const access = await this.resolveAccess(personId);
    const today = todayInSchoolTz();
    const date = query.date ?? today;
    assertValidDiaryDate(date, today);
    const { page, limit } = toOffsetLimit({
      page: query.page,
      pageSize: query.pageSize,
    });

    // An advisor / faculty / coordinator with no classes mapped gets an empty list, not an error.
    const empty = access.sectionIds !== null && access.sectionIds.length === 0;
    const { rows, summary } = empty
      ? {
          rows: [] as any[],
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            notMarked: 0,
            averagePercentage: null,
            below75: 0,
          } as any,
        }
      : await this.repo.findStudents(
          {
            scopeSectionIds: access.sectionIds,
            gradeIds: query.gradeIds,
            sectionIds: query.sectionIds,
            q: query.q,
            dayStatus: query.dayStatus,
            percentBand: query.percentBand,
            residence: query.residence,
            transport: query.transport,
            gender: query.gender,
            sort: query.sort,
          },
          date,
          page,
          limit,
        );

    const total = rows.length > 0 ? rows[0].total : 0;
    await this.recordRead(
      personId,
      access,
      'STUDENTS',
      date,
      query as Record<string, unknown>,
      total,
      meta,
    );
    return {
      date,
      page,
      pageSize: limit,
      total,
      summary: {
        ...summary,
        averagePercentage: num(summary.averagePercentage),
      },
      items: rows.map((r: any) => ({
        studentId: r.studentId,
        firstName: r.firstName,
        lastName: r.lastName,
        admissionNo: r.admissionNo,
        rollNo: r.rollNo,
        gradeId: r.gradeId,
        gradeName: r.gradeName,
        sectionId: r.sectionId,
        sectionName: r.sectionName,
        isHosteller: r.isHosteller,
        usesSchoolTransport: r.usesSchoolTransport,
        gender: r.gender,
        photoObjectKey: r.photoObjectKey,
        dayStatus: r.dayStatus,
        reason: r.reason,
        markedAt: r.markedAt,
        totalDays: r.totalDays,
        presentDays: r.presentDays,
        percentage: num(r.percentage),
      })),
    };
  }

  async listEmployees(
    personId: string,
    query: EmployeeDiaryQueryDto,
    meta: ReadMeta = {},
  ) {
    const access = await this.resolveAccess(personId);
    if (!access.canViewEmployees) {
      await this.audit
        .record({
          actorPersonId: personId,
          actorRoleCode: access.primaryRole,
          action: 'ATTENDANCE_DIARY_VIEW',
          objectType: 'attendance_diary',
          outcome: 'DENIED',
          afterData: { tab: 'EMPLOYEES' },
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          correlationId: meta.correlationId ?? null,
        })
        .catch((e) => this.logger.error(`audit write failed: ${e?.message}`));
      throw new ForbiddenException(
        'Employee attendance is not available for your role.',
      );
    }
    const today = todayInSchoolTz();
    const date = query.date ?? today;
    assertValidDiaryDate(date, today);
    const { page, limit } = toOffsetLimit({
      page: query.page,
      pageSize: query.pageSize,
    });

    const empty = access.sectionIds !== null && access.sectionIds.length === 0;
    const { rows, summary } = empty
      ? {
          rows: [] as any[],
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            onDuty: 0,
            onLeave: 0,
            notMarked: 0,
            averagePercentage: null,
          } as any,
        }
      : await this.repo.findEmployees(
          {
            scopeSectionIds: access.sectionIds,
            excludeLeadership: access.excludeLeadership,
            group: query.group,
            q: query.q,
            dayStatus: query.dayStatus,
            percentBand: query.percentBand,
            departmentId: query.departmentId,
            sort: query.sort,
          },
          date,
          page,
          limit,
        );

    const total = rows.length > 0 ? rows[0].total : 0;
    await this.recordRead(
      personId,
      access,
      'EMPLOYEES',
      date,
      query as Record<string, unknown>,
      total,
      meta,
    );
    return {
      date,
      page,
      pageSize: limit,
      total,
      summary: {
        ...summary,
        averagePercentage: num(summary.averagePercentage),
      },
      items: rows.map((r: any) => ({
        staffId: r.staffId,
        personId: r.personId,
        firstName: r.firstName,
        lastName: r.lastName,
        employeeNo: r.employeeNo,
        designation: r.designation,
        group: r.group,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        photoObjectKey: r.photoObjectKey,
        dayStatus: r.dayStatus,
        eventAt: r.eventAt,
        reason: r.reason,
        totalDays: r.totalDays,
        presentDays: r.presentDays,
        percentage: num(r.percentage),
      })),
    };
  }

  /** Limited, attendance-only profile of one student. Same scope rule as the lists: a student
   * outside the caller's scope is indistinguishable from one that does not exist (404). */
  async getStudentProfile(
    personId: string,
    studentId: string,
    dateArg: string | undefined,
    meta: ReadMeta = {},
  ) {
    const access = await this.resolveAccess(personId);
    const today = todayInSchoolTz();
    const date = dateArg ?? today;
    assertValidDiaryDate(date, today);
    const empty = access.sectionIds !== null && access.sectionIds.length === 0;
    const student = empty
      ? null
      : await this.repo.getStudentHeader(studentId, access.sectionIds);
    if (!student) throw new NotFoundException('Student not found.');

    const history = await this.repo.getStudentHistory(studentId, date);
    const attended = (s: string) => s === 'PRESENT' || s === 'LATE';
    const totalDays = history.length;
    const presentDays = history.filter((h) => h.status === 'PRESENT').length;
    const lateDays = history.filter((h) => h.status === 'LATE').length;
    const absentDays = totalDays - presentDays - lateDays;
    const monthly = new Map<
      string,
      { total: number; present: number; absent: number; late: number }
    >();
    for (const h of history) {
      const m = monthly.get(h.date.slice(0, 7)) ?? {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
      };
      m.total++;
      if (h.status === 'PRESENT') m.present++;
      else if (h.status === 'LATE') m.late++;
      else m.absent++;
      monthly.set(h.date.slice(0, 7), m);
    }
    const onDate = history.find((h) => h.date === date);
    await this.audit
      .record({
        actorPersonId: personId,
        actorRoleCode: access.primaryRole,
        action: 'ATTENDANCE_DIARY_STUDENT_VIEW',
        objectType: 'student',
        objectId: studentId,
        outcome: 'SUCCESS',
        afterData: { date, scope: access.kind },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        correlationId: meta.correlationId ?? null,
      })
      .catch((e) => this.logger.error(`audit write failed: ${e?.message}`));
    return {
      date,
      student,
      dayStatus: onDate?.status ?? 'NOT_MARKED',
      summary: {
        totalDays,
        presentDays,
        lateDays,
        absentDays,
        percentage:
          totalDays > 0
            ? Math.round(
                (1000 * history.filter((h) => attended(h.status)).length) /
                  totalDays,
              ) / 10
            : null,
      },
      monthly: [...monthly.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([month, v]) => ({ month, ...v })),
      recent: history.slice(0, 45),
    };
  }

  private async recordRead(
    personId: string,
    access: DiaryAccess,
    tab: 'STUDENTS' | 'EMPLOYEES',
    date: string,
    query: Record<string, unknown>,
    resultTotal: number,
    meta: ReadMeta,
  ) {
    // Filter NAMES only -- never the search text itself, so the audit log does not become a
    // second copy of personal data.
    const used = Object.keys(query).filter(
      (k) =>
        !['page', 'pageSize', 'date'].includes(k) && query[k] !== undefined,
    );
    await this.audit
      .record({
        actorPersonId: personId,
        actorRoleCode: access.primaryRole,
        action: 'ATTENDANCE_DIARY_VIEW',
        objectType: 'attendance_diary',
        outcome: 'SUCCESS',
        afterData: {
          tab,
          date,
          scope: access.kind,
          scopedSections: access.sectionIds?.length ?? null,
          filtersUsed: used,
          resultTotal,
        },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        correlationId: meta.correlationId ?? null,
      })
      // Best-effort: an audit hiccup must not take the screen down, but it is logged loudly.
      .catch((e) => this.logger.error(`audit write failed: ${e?.message}`));
  }
}
