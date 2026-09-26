import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AttendanceDiaryService,
  assertValidDiaryDate,
  todayInSchoolTz,
} from './attendance-diary.service';

function makeService(opts: {
  roles: string[];
  coordinatorRows?: {
    scopeType: string;
    scopeStage: string | null;
    scopeId: string | null;
  }[];
  gradeScopeSections?: string[];
  advisorSections?: string[];
  seatSections?: string[];
  teachingSections?: string[];
}) {
  const repo: any = {
    getActiveRoleCodes: jest.fn().mockResolvedValue(opts.roles),
    getCoordinatorScopeRows: jest
      .fn()
      .mockResolvedValue(opts.coordinatorRows ?? []),
    sectionIdsForGradeScope: jest
      .fn()
      .mockResolvedValue(opts.gradeScopeSections ?? []),
    advisorSectionIds: jest.fn().mockResolvedValue(opts.advisorSections ?? []),
    seatHolderSectionIds: jest.fn().mockResolvedValue(opts.seatSections ?? []),
    teachingSectionIds: jest
      .fn()
      .mockResolvedValue(opts.teachingSections ?? []),
    getCurrentYear: jest.fn().mockResolvedValue({
      id: 'y',
      name: '2025-2026',
      startDate: '2025-06-01',
      endDate: '2026-04-30',
    }),
    listClassOptions: jest.fn().mockResolvedValue([]),
    listDepartments: jest.fn().mockResolvedValue([]),
    findStudents: jest.fn().mockResolvedValue({
      rows: [],
      summary: {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        notMarked: 0,
        averagePercentage: null,
        below75: 0,
      },
    }),
    findEmployees: jest.fn().mockResolvedValue({
      rows: [],
      summary: {
        total: 0,
        present: 0,
        absent: 0,
        onDuty: 0,
        onLeave: 0,
        notMarked: 0,
        averagePercentage: null,
      },
    }),
  };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new AttendanceDiaryService(repo, audit), repo, audit };
}

describe('AttendanceDiaryService access rules', () => {
  it.each(['ADMIN', 'CORRESPONDENT', 'PRINCIPAL', 'VICE_PRINCIPAL'])(
    '%s sees the whole school (students + employees)',
    async (role) => {
      const { service } = makeService({ roles: [role] });
      const a = await service.resolveAccess('p1');
      expect(a.kind).toBe('FULL');
      expect(a.sectionIds).toBeNull();
      expect(a.canViewEmployees).toBe(true);
      expect(a.excludeLeadership).toBe(false);
    },
  );

  it('a principal who also holds FACULTY is still leadership (full scope)', async () => {
    const { service } = makeService({
      roles: ['FACULTY', 'PRINCIPAL'],
      teachingSections: ['s1'],
    });
    const a = await service.resolveAccess('p1');
    expect(a.kind).toBe('FULL');
    expect(a.primaryRole).toBe('PRINCIPAL');
  });

  it('academic coordinator is limited to the sections of their assigned grades, employees allowed but never leadership', async () => {
    const { service, repo } = makeService({
      roles: ['ACADEMIC_COORDINATOR'],
      coordinatorRows: [
        { scopeType: 'GRADE', scopeStage: null, scopeId: 'g5' },
      ],
      gradeScopeSections: ['sec5a', 'sec5b'],
    });
    const a = await service.resolveAccess('p1');
    expect(repo.sectionIdsForGradeScope).toHaveBeenCalledWith(
      ['g5'],
      [],
      false,
    );
    expect(a.kind).toBe('SCOPED');
    expect(a.sectionIds).toEqual(['sec5a', 'sec5b']);
    expect(a.canViewEmployees).toBe(true);
    expect(a.excludeLeadership).toBe(true);
  });

  it('class advisor sees only their own class and NO employees', async () => {
    const { service } = makeService({
      roles: ['CLASS_ADVISOR'],
      advisorSections: ['secA'],
    });
    const a = await service.resolveAccess('p1');
    expect(a.sectionIds).toEqual(['secA']);
    expect(a.canViewEmployees).toBe(false);
  });

  it('faculty sees only the classes they teach (plus a class-teacher seat they hold) and NO employees', async () => {
    const { service } = makeService({
      roles: ['FACULTY'],
      teachingSections: ['s2b', 's2c', 's4c', 's7a'],
      seatSections: ['s2b', 's9d'],
    });
    const a = await service.resolveAccess('p1');
    expect([...(a.sectionIds ?? [])].sort()).toEqual([
      's2b',
      's2c',
      's4c',
      's7a',
      's9d',
    ]);
    expect(a.canViewEmployees).toBe(false);
  });

  it('a role with no diary entitlement is refused', async () => {
    const { service } = makeService({ roles: ['PARENT'] });
    await expect(service.resolveAccess('p1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a person with no active roles at all is refused', async () => {
    const { service } = makeService({ roles: [] });
    await expect(service.resolveAccess('p1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('AttendanceDiaryService data scoping', () => {
  it('passes the resolved scope (never client input) to the student query', async () => {
    const { service, repo } = makeService({
      roles: ['FACULTY'],
      teachingSections: ['s1', 's2'],
    });
    await service.listStudents('p1', {
      sectionIds: ['someone-elses-section'],
    } as any);
    const filters = repo.findStudents.mock.calls[0][0];
    expect(filters.scopeSectionIds).toEqual(['s1', 's2']); // authoritative scope
    expect(filters.sectionIds).toEqual(['someone-elses-section']); // only ever AND-ed on top
  });

  it('a scoped user with zero mapped classes gets an empty list and the database is never queried', async () => {
    const { service, repo } = makeService({
      roles: ['CLASS_ADVISOR'],
      advisorSections: [],
    });
    const r = await service.listStudents('p1', {} as any);
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
    expect(repo.findStudents).not.toHaveBeenCalled();
  });

  it('employee list is forbidden for advisor/faculty and the attempt is audited as DENIED', async () => {
    for (const role of ['CLASS_ADVISOR', 'FACULTY']) {
      const { service, repo, audit } = makeService({
        roles: [role],
        teachingSections: ['s1'],
        advisorSections: ['s1'],
      });
      await expect(
        service.listEmployees('p1', {} as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findEmployees).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'DENIED',
          action: 'ATTENDANCE_DIARY_VIEW',
        }),
      );
    }
  });

  it('coordinator employee query excludes principal / vice principal and is limited to their sections', async () => {
    const { service, repo } = makeService({
      roles: ['ACADEMIC_COORDINATOR'],
      coordinatorRows: [
        { scopeType: 'STAGE', scopeStage: 'PRIMARY', scopeId: null },
      ],
      gradeScopeSections: ['a', 'b'],
    });
    await service.listEmployees('p1', {} as any);
    const f = repo.findEmployees.mock.calls[0][0];
    expect(f.excludeLeadership).toBe(true);
    expect(f.scopeSectionIds).toEqual(['a', 'b']);
  });

  it('leadership employee query is unrestricted', async () => {
    const { service, repo } = makeService({ roles: ['ADMIN'] });
    await service.listEmployees('p1', {} as any);
    const f = repo.findEmployees.mock.calls[0][0];
    expect(f.scopeSectionIds).toBeNull();
    expect(f.excludeLeadership).toBe(false);
  });

  it('audits every successful read with filter NAMES only, never the search text', async () => {
    const { service, audit } = makeService({ roles: ['ADMIN'] });
    await service.listStudents('p1', {
      q: 'Ravi Kumar',
      percentBand: 'LT75',
    } as any);
    const call = audit.record.mock.calls.find(
      (c: any[]) => c[0].outcome === 'SUCCESS',
    )![0];
    expect(call.afterData.filtersUsed).toEqual(
      expect.arrayContaining(['q', 'percentBand']),
    );
    expect(JSON.stringify(call)).not.toContain('Ravi');
  });

  it('an audit failure never breaks the response', async () => {
    const { service, audit } = makeService({ roles: ['ADMIN'] });
    audit.record.mockRejectedValue(new Error('db down'));
    await expect(service.listStudents('p1', {} as any)).resolves.toBeDefined();
  });
});

describe('date handling', () => {
  it('defaults to today in IST', () => {
    expect(todayInSchoolTz(new Date('2026-09-24T20:00:00Z'))).toBe(
      '2026-09-25',
    ); // already tomorrow in IST
    expect(todayInSchoolTz(new Date('2026-09-24T05:00:00Z'))).toBe(
      '2026-09-24',
    );
  });
  it('rejects impossible / absurd dates', () => {
    expect(() => assertValidDiaryDate('2026-02-30', '2026-09-24')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDiaryDate('1999-01-01', '2026-09-24')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDiaryDate('2030-01-01', '2026-09-24')).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertValidDiaryDate('2026-09-24', '2026-09-24'),
    ).not.toThrow();
  });
});
