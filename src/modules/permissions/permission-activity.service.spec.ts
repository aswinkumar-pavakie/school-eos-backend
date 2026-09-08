// Orchestration-level tests against mocked repositories -- same methodology as
// messaging.service.spec.ts (see its header comment): verifies the service derives
// identity/authorization the right way and enforces business rules correctly, not
// the real SQL join semantics (those only mean something against a real Postgres
// query, and there is no live table yet -- see module README).
//
// Numbering below tracks the CONTINUE PERMISSION MODULE prompt's FACULTY TESTS
// (1-25) list; not every numbered item maps 1:1 to a single `it`, but every item
// is covered by at least one assertion somewhere in this file.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreatePermissionActivityDto } from './dto/create-permission-activity.dto';
import { PermissionActivityService } from './permission-activity.service';
import { PermissionActivityView } from './repositories/permission-activity.repository';

const FACULTY_ACTOR: AuthenticatedUser = {
  personId: 'faculty-1',
  roles: ['FACULTY'],
};

function makeActivity(
  overrides: Partial<PermissionActivityView> = {},
): PermissionActivityView {
  return {
    id: 'activity-1',
    academicYearId: 'year-1',
    academicYearName: '2025-2026',
    sectionId: 'section-1',
    sectionName: 'A',
    gradeName: '8',
    createdByStaffId: 'staff-1',
    title: 'Science Museum Field Trip',
    description: 'Grade 8 trip to the science museum',
    permissionType: 'TRIP',
    activityDate: '2026-09-18',
    startTime: '09:00',
    endTime: '15:00',
    responseDeadline: '2026-09-15',
    status: 'ACTIVE',
    cancelledAt: null,
    cancelledBy: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCreateDto(
  overrides: Partial<CreatePermissionActivityDto> = {},
): CreatePermissionActivityDto {
  const dto = new CreatePermissionActivityDto();
  Object.assign(dto, {
    title: 'Science Museum Field Trip',
    description: 'Grade 8 trip to the science museum',
    permissionType: 'TRIP',
    academicYearId: 'year-1',
    sectionId: 'section-1',
    activityDate: '2026-09-18',
    startTime: '09:00',
    endTime: '15:00',
    responseDeadline: '2026-09-15',
    allStudents: true,
    ...overrides,
  });
  return dto;
}

function buildService(
  opts: {
    staff?: { id: string; personId: string; status: string } | null;
    teacherSections?: { sectionId: string; academicYearId: string }[];
    advisorSections?: { sectionId: string; academicYearId: string }[];
    section?: {
      id: string;
      academicYearId: string;
      gradeName: string;
      sectionName: string;
    } | null;
    enrolledStudents?: {
      studentId: string;
      firstName: string;
      lastName: string;
    }[];
    isActivelyEnrolled?: boolean;
    activity?: PermissionActivityView | null;
    activityCancelResult?: boolean;
    statusSummary?: {
      total: number;
      consented: number;
      declined: number;
      pending: number;
      expired: number;
      cancelled: number;
    };
    responderPerson?: {
      personId: string;
      firstName: string;
      lastName: string;
      displayName: string | null;
    } | null;
  } = {},
) {
  const staffRepo = {
    findByPersonId: jest
      .fn()
      .mockResolvedValue(
        opts.staff === undefined
          ? { id: 'staff-1', personId: 'faculty-1', status: 'ACTIVE' }
          : opts.staff,
      ),
  } as any;

  const subjectOfferingRepo = {
    findActiveSectionsForTeacher: jest
      .fn()
      .mockResolvedValue(
        opts.teacherSections ?? [
          { sectionId: 'section-1', academicYearId: 'year-1' },
        ],
      ),
  } as any;

  const classAdvisorRepo = {
    findActiveSectionsForAdvisor: jest
      .fn()
      .mockResolvedValue(opts.advisorSections ?? []),
  } as any;

  const sectionRepo = {
    findById: jest.fn().mockResolvedValue(
      opts.section === undefined
        ? {
            id: 'section-1',
            academicYearId: 'year-1',
            gradeName: '8',
            sectionName: 'A',
          }
        : opts.section,
    ),
  } as any;

  const studentEnrolmentRepo = {
    findActiveStudentsInSection: jest.fn().mockResolvedValue(
      opts.enrolledStudents ?? [
        { studentId: 'student-1', firstName: 'Aarav', lastName: 'Kumar' },
        { studentId: 'student-2', firstName: 'Diya', lastName: 'Shah' },
      ],
    ),
    isActivelyEnrolled: jest
      .fn()
      .mockResolvedValue(opts.isActivelyEnrolled ?? true),
  } as any;

  const activity = opts.activity === undefined ? makeActivity() : opts.activity;

  const activityRepo = {
    create: jest.fn().mockResolvedValue(activity),
    findById: jest.fn().mockResolvedValue(activity),
    listBySectionYearPairs: jest
      .fn()
      .mockResolvedValue(activity ? [activity] : []),
    update: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(opts.activityCancelResult ?? true),
  } as any;

  const requestRepo = {
    createMany: jest.fn().mockResolvedValue([]),
    findByActivityId: jest.fn().mockResolvedValue([]),
    cancelPendingByActivityId: jest.fn().mockResolvedValue(undefined),
    summarizeByActivityId: jest.fn().mockResolvedValue(
      opts.statusSummary ?? {
        total: 2,
        consented: 0,
        declined: 0,
        pending: 2,
        expired: 0,
        cancelled: 0,
      },
    ),
  } as any;

  const personRepo = {
    findDisplayName: jest.fn().mockResolvedValue(
      opts.responderPerson === undefined
        ? {
            personId: 'parent-1',
            firstName: 'Priya',
            lastName: 'Kumar',
            displayName: null,
          }
        : opts.responderPerson,
    ),
  } as any;

  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as any;

  const unitOfWork = {
    run: jest
      .fn()
      .mockImplementation(async (work: (client: any) => Promise<any>) =>
        work({}),
      ),
  } as any;

  const service = new PermissionActivityService(
    staffRepo,
    subjectOfferingRepo,
    classAdvisorRepo,
    sectionRepo,
    studentEnrolmentRepo,
    activityRepo,
    requestRepo,
    personRepo,
    auditService,
    unitOfWork,
  );

  return {
    service,
    staffRepo,
    subjectOfferingRepo,
    classAdvisorRepo,
    sectionRepo,
    studentEnrolmentRepo,
    activityRepo,
    requestRepo,
    personRepo,
    auditService,
    unitOfWork,
  };
}

describe('PermissionActivityService — faculty identity', () => {
  it('1. throws Forbidden when the actor has no staff row at all', async () => {
    const { service } = buildService({ staff: null });
    await expect(service.list(FACULTY_ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('2. throws Forbidden when the staff row exists but is not ACTIVE', async () => {
    const { service } = buildService({
      staff: { id: 'staff-1', personId: 'faculty-1', status: 'INACTIVE' },
    });
    await expect(service.list(FACULTY_ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PermissionActivityService — create', () => {
  it('3. 404s when the section does not exist', async () => {
    const { service } = buildService({ section: null });
    await expect(
      service.create(FACULTY_ACTOR, makeCreateDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('4. 404s when the section belongs to a different academic year than supplied', async () => {
    const { service } = buildService({
      section: {
        id: 'section-1',
        academicYearId: 'year-OTHER',
        gradeName: '8',
        sectionName: 'A',
      },
    });
    await expect(
      service.create(FACULTY_ACTOR, makeCreateDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('5. 404s (never 403) when faculty is neither teaching nor advising this section — indistinguishable from "section not found"', async () => {
    const { service, activityRepo } = buildService({
      teacherSections: [],
      advisorSections: [],
    });
    await expect(
      service.create(FACULTY_ACTOR, makeCreateDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(activityRepo.create).not.toHaveBeenCalled();
  });

  it('6. subject-teacher authorization alone is sufficient', async () => {
    const { service } = buildService({
      teacherSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
      advisorSections: [],
    });
    await expect(
      service.create(FACULTY_ACTOR, makeCreateDto()),
    ).resolves.toBeDefined();
  });

  it('7. class-advisor authorization alone is sufficient', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
    });
    await expect(
      service.create(FACULTY_ACTOR, makeCreateDto()),
    ).resolves.toBeDefined();
  });

  it('8. dual role (subject teacher AND class advisor for the same section) authorizes exactly once, no duplicate creation', async () => {
    const { service, activityRepo } = buildService({
      teacherSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
      advisorSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
    });
    await service.create(FACULTY_ACTOR, makeCreateDto());
    expect(activityRepo.create).toHaveBeenCalledTimes(1);
  });

  it('9. rejects startTime >= endTime', async () => {
    const { service } = buildService();
    await expect(
      service.create(
        FACULTY_ACTOR,
        makeCreateDto({ startTime: '15:00', endTime: '09:00' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('10. rejects a response deadline after the activity date', async () => {
    const { service } = buildService();
    await expect(
      service.create(
        FACULTY_ACTOR,
        makeCreateDto({
          activityDate: '2026-09-18',
          responseDeadline: '2026-09-20',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('11. allStudents=true resolves the roster server-side, ignoring any client studentIds', async () => {
    const { service, studentEnrolmentRepo, requestRepo } = buildService();
    await service.create(FACULTY_ACTOR, makeCreateDto({ allStudents: true }));
    expect(
      studentEnrolmentRepo.findActiveStudentsInSection,
    ).toHaveBeenCalledWith('section-1', 'year-1');
    expect(requestRepo.createMany).toHaveBeenCalledWith(
      'activity-1',
      ['student-1', 'student-2'],
      expect.anything(),
    );
  });

  it('12. allStudents=true with zero active students rejects with NO_ELIGIBLE_STUDENTS', async () => {
    const { service } = buildService({ enrolledStudents: [] });
    await expect(
      service.create(FACULTY_ACTOR, makeCreateDto({ allStudents: true })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('13. explicit studentIds are independently re-validated, not trusted as-is', async () => {
    const { service, studentEnrolmentRepo, requestRepo } = buildService();
    await service.create(
      FACULTY_ACTOR,
      makeCreateDto({ allStudents: false, studentIds: ['student-9'] }),
    );
    expect(studentEnrolmentRepo.isActivelyEnrolled).toHaveBeenCalledWith(
      'student-9',
      'section-1',
      'year-1',
    );
    expect(requestRepo.createMany).toHaveBeenCalledWith(
      'activity-1',
      ['student-9'],
      expect.anything(),
    );
  });

  it('14. one ineligible student in an explicit selection rejects the whole request, creating nothing', async () => {
    const { service, requestRepo } = buildService({
      isActivelyEnrolled: false,
    });
    await expect(
      service.create(
        FACULTY_ACTOR,
        makeCreateDto({ allStudents: false, studentIds: ['student-9'] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(requestRepo.createMany).not.toHaveBeenCalled();
  });

  it('15. creates the activity and its per-student requests atomically, inside one UnitOfWork transaction', async () => {
    const { service, unitOfWork } = buildService();
    await service.create(FACULTY_ACTOR, makeCreateDto());
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
  });

  it('16. records an audit event for activity creation', async () => {
    const { service, auditService } = buildService();
    await service.create(FACULTY_ACTOR, makeCreateDto());
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorPersonId: 'faculty-1',
        actorRoleCode: 'FACULTY',
        action: 'PERMISSION_ACTIVITY_CREATED',
        objectType: 'permission_activity',
        outcome: 'SUCCESS',
      }),
    );
  });

  it("17. never persists created_by_staff_id from anything other than the authenticated actor's own resolved staff.id", async () => {
    const { service, activityRepo } = buildService({
      staff: { id: 'staff-XYZ', personId: 'faculty-1', status: 'ACTIVE' },
    });
    await service.create(FACULTY_ACTOR, makeCreateDto());
    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdByStaffId: 'staff-XYZ' }),
      expect.anything(),
    );
  });
});

describe('PermissionActivityService — list / detail (never from created_by_staff_id)', () => {
  it('18. list derives authorized sections from the live teaching+advising union, deduplicated', async () => {
    const { service, activityRepo } = buildService({
      teacherSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
      advisorSections: [
        { sectionId: 'section-1', academicYearId: 'year-1' },
        { sectionId: 'section-2', academicYearId: 'year-1' },
      ],
    });
    await service.list(FACULTY_ACTOR);
    expect(activityRepo.listBySectionYearPairs).toHaveBeenCalledWith([
      { sectionId: 'section-1', academicYearId: 'year-1' },
      { sectionId: 'section-2', academicYearId: 'year-1' },
    ]);
  });

  it('19. detail 404s when the activity does not exist', async () => {
    const { service } = buildService({ activity: null });
    await expect(
      service.detail(FACULTY_ACTOR, 'activity-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('20. detail 404s (not 403) when the activity exists but this faculty has no CURRENT authorization for its section — e.g. after reassignment', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [],
    });
    await expect(
      service.detail(FACULTY_ACTOR, 'activity-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('21. detail returns the live student-count summary alongside the activity', async () => {
    const { service } = buildService({
      statusSummary: {
        total: 5,
        consented: 2,
        declined: 1,
        pending: 2,
        expired: 0,
        cancelled: 0,
      },
    });
    const result = await service.detail(FACULTY_ACTOR, 'activity-1');
    expect(result.studentCount).toBe(5);
  });
});

describe('PermissionActivityService — update', () => {
  it('22. update 404s when unauthorized, identical to detail', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [],
    });
    await expect(
      service.update(FACULTY_ACTOR, 'activity-1', {
        title: 'New title',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('23. update rejects once the activity is already CANCELLED', async () => {
    const { service } = buildService({
      activity: makeActivity({ status: 'CANCELLED' }),
    });
    await expect(
      service.update(FACULTY_ACTOR, 'activity-1', {
        title: 'New title',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('24. update rejects an invalid merged time range (only one of start/end supplied)', async () => {
    const { service } = buildService({
      activity: makeActivity({ startTime: '09:00', endTime: '15:00' }),
    });
    await expect(
      service.update(FACULTY_ACTOR, 'activity-1', {
        startTime: '16:00',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('25. update rejects a merged deadline after the (possibly unchanged) activity date', async () => {
    const { service } = buildService({
      activity: makeActivity({ activityDate: '2026-09-18' }),
    });
    await expect(
      service.update(FACULTY_ACTOR, 'activity-1', {
        responseDeadline: '2026-09-25',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never forwards academicYearId/sectionId/permissionType/studentIds/createdByStaffId to the repository update call', async () => {
    const { service, activityRepo } = buildService();
    await service.update(FACULTY_ACTOR, 'activity-1', {
      title: 'Updated title',
    } as any);
    const forwarded = activityRepo.update.mock.calls[0][1];
    expect(forwarded).not.toHaveProperty('academicYearId');
    expect(forwarded).not.toHaveProperty('sectionId');
    expect(forwarded).not.toHaveProperty('permissionType');
    expect(forwarded).not.toHaveProperty('studentIds');
    expect(forwarded).not.toHaveProperty('createdByStaffId');
  });

  it('records an audit event with before/after data', async () => {
    const { service, auditService } = buildService();
    await service.update(FACULTY_ACTOR, 'activity-1', {
      title: 'Updated title',
    } as any);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PERMISSION_ACTIVITY_UPDATED',
        outcome: 'SUCCESS',
      }),
    );
  });
});

describe('PermissionActivityService — cancel (cascade only PENDING)', () => {
  it('cancel 404s when unauthorized', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [],
    });
    await expect(
      service.cancel(FACULTY_ACTOR, 'activity-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atomic conditional cancel: a concurrent/duplicate cancel is rejected as a conflict, never cascades twice', async () => {
    const { service, requestRepo } = buildService({
      activityCancelResult: false,
    });
    await expect(
      service.cancel(FACULTY_ACTOR, 'activity-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(requestRepo.cancelPendingByActivityId).not.toHaveBeenCalled();
  });

  it('successful cancel cascades to PENDING requests only, in the same transaction, and records an audit event', async () => {
    const { service, requestRepo, auditService, unitOfWork } = buildService();
    await service.cancel(FACULTY_ACTOR, 'activity-1');
    expect(requestRepo.cancelPendingByActivityId).toHaveBeenCalledWith(
      'activity-1',
      expect.anything(),
    );
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PERMISSION_ACTIVITY_CANCELLED',
        outcome: 'SUCCESS',
      }),
    );
  });
});

describe('PermissionActivityService — status summary (live EXPIRED reclassification)', () => {
  it('status 404s when unauthorized', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [],
    });
    await expect(
      service.status(FACULTY_ACTOR, 'activity-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reclassifies a still-PENDING request past its deadline as EXPIRED without any physical write', async () => {
    const { service, requestRepo } = buildService({
      activity: makeActivity({ responseDeadline: '2020-01-01' }),
    });
    requestRepo.findByActivityId.mockResolvedValue([
      { id: 'req-1', status: 'PENDING' },
      { id: 'req-2', status: 'CONSENTED' },
    ]);
    const summary = await service.status(FACULTY_ACTOR, 'activity-1');
    expect(summary.expired).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.consented).toBe(1);
  });
});

describe('PermissionActivityService — listMySections (Post-request form picker)', () => {
  it("returns the faculty's own live-authorized sections, deduplicated, resolved to names via SectionRepository", async () => {
    const { service, sectionRepo } = buildService({
      teacherSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
      advisorSections: [
        { sectionId: 'section-1', academicYearId: 'year-1' },
        { sectionId: 'section-2', academicYearId: 'year-1' },
      ],
    });
    sectionRepo.findById.mockImplementation(async (id: string) =>
      id === 'section-1'
        ? {
            id: 'section-1',
            academicYearId: 'year-1',
            gradeName: '8',
            sectionName: 'A',
          }
        : {
            id: 'section-2',
            academicYearId: 'year-1',
            gradeName: '9',
            sectionName: 'B',
          },
    );
    const result = await service.listMySections(FACULTY_ACTOR);
    expect(result).toEqual([
      {
        sectionId: 'section-1',
        academicYearId: 'year-1',
        gradeName: '8',
        sectionName: 'A',
      },
      {
        sectionId: 'section-2',
        academicYearId: 'year-1',
        gradeName: '9',
        sectionName: 'B',
      },
    ]);
  });

  it('throws Forbidden for an inactive/non-faculty actor, same as every other faculty endpoint', async () => {
    const { service } = buildService({ staff: null });
    await expect(service.listMySections(FACULTY_ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PermissionActivityService — per-student breakdown (History detail)', () => {
  it('404s when unauthorized, identical to detail/status', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [],
    });
    await expect(
      service.listStudentRequests(FACULTY_ACTOR, 'activity-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("resolves the responding guardian's display name for a responded request", async () => {
    const { service, requestRepo } = buildService({
      responderPerson: {
        personId: 'parent-1',
        firstName: 'Priya',
        lastName: 'Kumar',
        displayName: null,
      },
    });
    requestRepo.findByActivityId.mockResolvedValue([
      {
        id: 'req-1',
        studentId: 'student-1',
        studentFirstName: 'Aarav',
        studentLastName: 'Kumar',
        status: 'CONSENTED',
        respondedByPersonId: 'parent-1',
        signedAt: new Date('2026-09-01T00:00:00Z'),
        declineReason: null,
        responseDeadline: '2099-01-01',
      },
    ]);
    const [result] = await service.listStudentRequests(
      FACULTY_ACTOR,
      'activity-1',
    );
    expect(result.studentName).toBe('Aarav Kumar');
    expect(result.status).toBe('CONSENTED');
    expect(result.responderName).toBe('Priya Kumar');
  });

  it('leaves responderName null for a still-PENDING request, never calling the person lookup', async () => {
    const { service, requestRepo, personRepo } = buildService();
    requestRepo.findByActivityId.mockResolvedValue([
      {
        id: 'req-2',
        studentId: 'student-2',
        studentFirstName: 'Diya',
        studentLastName: 'Shah',
        status: 'PENDING',
        respondedByPersonId: null,
        signedAt: null,
        declineReason: null,
        responseDeadline: '2099-01-01',
      },
    ]);
    const [result] = await service.listStudentRequests(
      FACULTY_ACTOR,
      'activity-1',
    );
    expect(result.responderName).toBeNull();
    expect(personRepo.findDisplayName).not.toHaveBeenCalled();
  });

  it('reclassifies a PENDING row past its deadline as EXPIRED here too', async () => {
    const { service, requestRepo } = buildService();
    requestRepo.findByActivityId.mockResolvedValue([
      {
        id: 'req-3',
        studentId: 'student-3',
        studentFirstName: 'Rohan',
        studentLastName: 'Verma',
        status: 'PENDING',
        respondedByPersonId: null,
        signedAt: null,
        declineReason: null,
        responseDeadline: '2020-01-01',
      },
    ]);
    const [result] = await service.listStudentRequests(
      FACULTY_ACTOR,
      'activity-1',
    );
    expect(result.status).toBe('EXPIRED');
  });
});
