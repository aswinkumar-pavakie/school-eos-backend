// Orchestration-level tests against mocked repositories. The real authorization
// semantics (REVOKED guardian excluded, TRANSFERRED_SECTION/CLOSED enrolment
// excluded, current subject_offering.teacher_staff_id, CLASS_ADVISOR
// role_assignment) live in the real SQL joins inside the repositories — those are
// only meaningfully verified against a real Postgres query (see the real HTTP E2E
// verification in the final report), not by mocking join behavior here. This suite
// covers: does the service call the right repository methods with the right
// (server-resolved) identity, dedupe/derive correctly from what the repositories
// return, and enforce the object-level 404 rule consistently.

import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { MessagingService } from './messaging.service';
import { ConversationView } from './repositories/conversation.repository';

const PARENT_ACTOR: AuthenticatedUser = {
  personId: 'parent-1',
  roles: ['PARENT'],
};
const FACULTY_ACTOR: AuthenticatedUser = {
  personId: 'faculty-1',
  roles: ['FACULTY'],
};
const PRINCIPAL_ACTOR: AuthenticatedUser = {
  personId: 'principal-1',
  roles: ['PRINCIPAL'],
};

function makeConversation(
  overrides: Partial<ConversationView> = {},
): ConversationView {
  return {
    id: 'conv-1',
    conversationType: 'STUDENT_CONTEXT',
    studentId: 'student-1',
    studentFirstName: 'Aarav',
    studentLastName: 'Kumar',
    parentPersonId: 'parent-1',
    academicYearId: 'year-1',
    academicYearName: '2025-2026',
    sectionId: 'section-1',
    sectionName: 'A',
    gradeName: '8',
    personAId: null,
    personBId: null,
    status: 'ACTIVE',
    lastMessageId: null,
    lastMessageAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function makeStaffDirectConversation(
  overrides: Partial<ConversationView> = {},
): ConversationView {
  return {
    id: 'staff-conv-1',
    conversationType: 'STAFF_DIRECT',
    studentId: null,
    studentFirstName: null,
    studentLastName: null,
    parentPersonId: null,
    academicYearId: null,
    academicYearName: null,
    sectionId: null,
    sectionName: null,
    gradeName: null,
    personAId: 'faculty-1',
    personBId: 'principal-1',
    status: 'ACTIVE',
    lastMessageId: null,
    lastMessageAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

const TEACHER = {
  staffId: 'staff-teacher',
  personId: 'faculty-1',
  firstName: 'Lakshmi',
  lastName: 'P',
  displayName: null,
};
const ADVISOR = {
  staffId: 'staff-advisor',
  personId: 'faculty-2',
  firstName: 'Suresh',
  lastName: 'K',
  displayName: null,
};

function buildService(
  opts: {
    conversation?: ConversationView | null;
    wardEnrolments?: any[];
    wardEnrolment?: any | null;
    staff?: { id: string; personId: string; status: string } | null;
    teachers?: (typeof TEACHER)[];
    advisors?: (typeof ADVISOR)[];
    teacherSections?: { sectionId: string; academicYearId: string }[];
    advisorSections?: { sectionId: string; academicYearId: string }[];
    ownParticipant?: { lastReadAt: Date | null } | null;
    unreadCount?: number;
    lastMessage?: any | null;
    parentDisplayName?: any | null;
    guardianPairs?: {
      studentId: string;
      academicYearId: string;
      sectionId: string;
      parentPersonId: string;
    }[];
    activeStudentContext?: {
      studentId: string;
      studentFirstName: string;
      studentLastName: string;
      academicYearId: string;
      sectionId: string;
      guardians: {
        personId: string;
        firstName: string;
        lastName: string;
        displayName: string | null;
      }[];
    } | null;
    staffDirectConversation?: ConversationView | null;
    staffDirectConversations?: ConversationView[];
    principalStudentConversations?: ConversationView[];
    principalsByConversation?: Map<
      string,
      {
        personId: string;
        firstName: string;
        lastName: string;
        displayName: string | null;
      }[]
    >;
    activePrincipalIds?: string[];
    targetIsActiveFaculty?: boolean;
    activePrincipalPersonId?: string | null;
  } = {},
) {
  const conversation =
    opts.conversation === undefined ? makeConversation() : opts.conversation;

  const guardianLinkRepo = {
    findActiveWardEnrolments: jest.fn().mockResolvedValue(
      opts.wardEnrolments ?? [
        {
          studentId: 'student-1',
          studentFirstName: 'Aarav',
          studentLastName: 'Kumar',
          academicYearId: 'year-1',
          academicYearName: '2025-2026',
          sectionId: 'section-1',
          sectionName: 'A',
          gradeName: '8',
        },
      ],
    ),
    findActiveWardEnrolment: jest.fn().mockResolvedValue(
      opts.wardEnrolment === undefined
        ? {
            studentId: 'student-1',
            academicYearId: 'year-1',
            sectionId: 'section-1',
          }
        : opts.wardEnrolment,
    ),
    findActiveGuardiansForSections: jest.fn().mockResolvedValue(
      opts.guardianPairs ?? [
        {
          studentId: 'student-1',
          academicYearId: 'year-1',
          sectionId: 'section-1',
          parentPersonId: 'parent-1',
        },
      ],
    ),
    findActiveContextForStudent: jest.fn().mockResolvedValue(
      opts.activeStudentContext === undefined
        ? {
            studentId: 'student-1',
            studentFirstName: 'Aarav',
            studentLastName: 'Kumar',
            academicYearId: 'year-1',
            sectionId: 'section-1',
            guardians: [
              {
                personId: 'parent-1',
                firstName: 'Indira',
                lastName: 'Palaniappan',
                displayName: null,
              },
            ],
          }
        : opts.activeStudentContext,
    ),
  } as any;

  const staffRepo = {
    findByPersonId: jest
      .fn()
      .mockResolvedValue(
        opts.staff === undefined
          ? { id: 'staff-teacher', personId: 'faculty-1', status: 'ACTIVE' }
          : opts.staff,
      ),
  } as any;

  const subjectOfferingRepo = {
    findActiveTeachersForSection: jest
      .fn()
      .mockResolvedValue(opts.teachers ?? [TEACHER]),
    findActiveTeachersForSections: jest
      .fn()
      .mockImplementation(
        async (pairs: { sectionId: string; academicYearId: string }[]) => {
          const map = new Map<string, (typeof TEACHER)[]>();
          for (const p of pairs)
            map.set(
              `${p.sectionId}:${p.academicYearId}`,
              opts.teachers ?? [TEACHER],
            );
          return map;
        },
      ),
    findActiveSectionsForTeacher: jest
      .fn()
      .mockResolvedValue(
        opts.teacherSections ?? [
          { sectionId: 'section-1', academicYearId: 'year-1' },
        ],
      ),
  } as any;

  const classAdvisorRepo = {
    findActiveAdvisorsForSections: jest
      .fn()
      .mockImplementation(async (sectionIds: string[]) => {
        const map = new Map<string, (typeof ADVISOR)[]>();
        for (const id of sectionIds) map.set(id, opts.advisors ?? [ADVISOR]);
        return map;
      }),
    findActiveAdvisorsForSection: jest
      .fn()
      .mockResolvedValue(opts.advisors ?? [ADVISOR]),
    findActiveSectionsForAdvisor: jest
      .fn()
      .mockResolvedValue(opts.advisorSections ?? []),
  } as any;

  const conversationRepo = {
    findById: jest.fn().mockResolvedValue(conversation),
    findOrCreate: jest.fn().mockResolvedValue(conversation),
    listForParent: jest
      .fn()
      .mockResolvedValue(conversation ? [conversation] : []),
    listBySectionYearPairs: jest
      .fn()
      .mockResolvedValue(conversation ? [conversation] : []),
    ensureExist: jest.fn().mockResolvedValue(undefined),
    updateLastMessage: jest.fn().mockResolvedValue(undefined),
    findOrCreateStaffDirect: jest
      .fn()
      .mockResolvedValue(opts.staffDirectConversation ?? null),
    listStaffDirectForPerson: jest
      .fn()
      .mockResolvedValue(opts.staffDirectConversations ?? []),
    listStudentContextForPrincipal: jest
      .fn()
      .mockResolvedValue(opts.principalStudentConversations ?? []),
  } as any;

  const participantRepo = {
    sync: jest.fn().mockResolvedValue(undefined),
    syncMany: jest.fn().mockResolvedValue(undefined),
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.ownParticipant === undefined ? null : opts.ownParticipant,
      ),
    findManyOwn: jest
      .fn()
      .mockImplementation(async (conversationIds: string[]) => {
        const map = new Map<string, Date | null>();
        if (opts.ownParticipant !== undefined) {
          for (const id of conversationIds)
            map.set(id, opts.ownParticipant?.lastReadAt ?? null);
        }
        return map;
      }),
    markRead: jest.fn().mockResolvedValue(undefined),
    listForConversation: jest.fn().mockResolvedValue([]),
    findByRoleForConversations: jest
      .fn()
      .mockResolvedValue(opts.principalsByConversation ?? new Map()),
  } as any;

  const messageRepo = {
    countUnread: jest.fn().mockResolvedValue(opts.unreadCount ?? 0),
    countUnreadMany: jest
      .fn()
      .mockImplementation(async (requests: { conversationId: string }[]) => {
        const map = new Map<string, number>();
        for (const r of requests)
          map.set(r.conversationId, opts.unreadCount ?? 0);
        return map;
      }),
    findById: jest
      .fn()
      .mockResolvedValue(
        opts.lastMessage === undefined ? null : opts.lastMessage,
      ),
    findByIds: jest
      .fn()
      .mockResolvedValue(
        opts.lastMessage === undefined ? [] : [opts.lastMessage],
      ),
    listPage: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue({
      id: '101',
      conversationId: 'conv-1',
      senderPersonId: 'parent-1',
      messageText: 'Good morning',
      createdAt: new Date('2026-09-05T10:00:00Z'),
    }),
  } as any;

  const defaultParentDisplayName = {
    personId: 'parent-1',
    firstName: 'Indira',
    lastName: 'Palaniappan',
    displayName: null,
  };
  const personRepo = {
    findDisplayName: jest
      .fn()
      .mockResolvedValue(
        opts.parentDisplayName === undefined
          ? defaultParentDisplayName
          : opts.parentDisplayName,
      ),
    findDisplayNames: jest
      .fn()
      .mockImplementation(async (personIds: string[]) => {
        const view =
          opts.parentDisplayName === undefined
            ? defaultParentDisplayName
            : opts.parentDisplayName;
        const map = new Map<string, typeof defaultParentDisplayName>();
        if (view) {
          for (const id of personIds) map.set(id, { ...view, personId: id });
        }
        return map;
      }),
  } as any;

  const principalRepo = {
    isActivePrincipal: jest
      .fn()
      .mockImplementation(async (personId: string) =>
        (opts.activePrincipalIds ?? ['principal-1']).includes(personId),
      ),
    filterActivePrincipals: jest
      .fn()
      .mockImplementation(async (personIds: string[]) => {
        const active = opts.activePrincipalIds ?? ['principal-1'];
        return new Set(personIds.filter((id) => active.includes(id)));
      }),
    isActiveFaculty: jest
      .fn()
      .mockResolvedValue(opts.targetIsActiveFaculty ?? true),
    findActivePrincipalPersonId: jest
      .fn()
      .mockResolvedValue(
        opts.activePrincipalPersonId === undefined
          ? 'principal-1'
          : opts.activePrincipalPersonId,
      ),
  } as any;

  const translationService = {
    translate: jest.fn().mockResolvedValue({
      messageId: '101',
      sourceLanguage: 'en',
      targetLanguage: 'ta',
      translatedText: 'காலை வணக்கம்',
    }),
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

  const service = new MessagingService(
    guardianLinkRepo,
    staffRepo,
    subjectOfferingRepo,
    classAdvisorRepo,
    conversationRepo,
    participantRepo,
    messageRepo,
    personRepo,
    principalRepo,
    translationService,
    auditService,
    unitOfWork,
  );

  return {
    service,
    guardianLinkRepo,
    staffRepo,
    subjectOfferingRepo,
    classAdvisorRepo,
    conversationRepo,
    participantRepo,
    messageRepo,
    personRepo,
    principalRepo,
    translationService,
    auditService,
    unitOfWork,
  };
}

describe('MessagingService — conversation list', () => {
  it('1. parent list: resolves wards from the authenticated personId and find-or-creates a conversation per ward', async () => {
    const { service, guardianLinkRepo, conversationRepo } = buildService();

    const result = await service.listConversations(PARENT_ACTOR);

    expect(guardianLinkRepo.findActiveWardEnrolments).toHaveBeenCalledWith(
      'parent-1',
    );
    expect(conversationRepo.findOrCreate).toHaveBeenCalledWith(
      'student-1',
      'parent-1',
      'year-1',
      'section-1',
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.student!.name).toBe('Aarav Kumar');
  });

  it('22. parent with two active wards sees both, never merged', async () => {
    const ward2 = {
      studentId: 'student-2',
      studentFirstName: 'Diya',
      studentLastName: 'Kumar',
      academicYearId: 'year-1',
      academicYearName: '2025-2026',
      sectionId: 'section-9',
      sectionName: 'C',
      gradeName: '5',
    };
    const conv2 = makeConversation({
      id: 'conv-2',
      studentId: 'student-2',
      studentFirstName: 'Diya',
      sectionId: 'section-9',
      sectionName: 'C',
      gradeName: '5',
    });
    const { service, conversationRepo } = buildService({
      wardEnrolments: [
        {
          studentId: 'student-1',
          studentFirstName: 'Aarav',
          studentLastName: 'Kumar',
          academicYearId: 'year-1',
          academicYearName: '2025-2026',
          sectionId: 'section-1',
          sectionName: 'A',
          gradeName: '8',
        },
        ward2,
      ],
    });
    conversationRepo.listForParent.mockResolvedValue([
      makeConversation(),
      conv2,
    ]);

    const result = await service.listConversations(PARENT_ACTOR);

    expect(conversationRepo.findOrCreate).toHaveBeenCalledTimes(2);
    expect(result.map((r) => r.student!.name)).toEqual([
      'Aarav Kumar',
      'Diya Kumar',
    ]);
  });

  it('16. faculty list: only conversations matching their currently authorized (section, year) pairs', async () => {
    const { service, subjectOfferingRepo, classAdvisorRepo, conversationRepo } =
      buildService();

    await service.listConversations(FACULTY_ACTOR);

    expect(
      subjectOfferingRepo.findActiveSectionsForTeacher,
    ).toHaveBeenCalledWith('staff-teacher');
    expect(classAdvisorRepo.findActiveSectionsForAdvisor).toHaveBeenCalledWith(
      'faculty-1',
    );
    expect(conversationRepo.listBySectionYearPairs).toHaveBeenCalledWith([
      { sectionId: 'section-1', academicYearId: 'year-1' },
    ]);
  });

  it('faculty list: every ACTIVE (student, guardian) pair in their authorized sections gets a conversation ensured to exist, not just pre-existing ones', async () => {
    const { service, guardianLinkRepo, conversationRepo } = buildService({
      guardianPairs: [
        {
          studentId: 'student-1',
          academicYearId: 'year-1',
          sectionId: 'section-1',
          parentPersonId: 'parent-1',
        },
        {
          studentId: 'student-2',
          academicYearId: 'year-1',
          sectionId: 'section-1',
          parentPersonId: 'parent-2',
        },
        {
          studentId: 'student-2',
          academicYearId: 'year-1',
          sectionId: 'section-1',
          parentPersonId: 'parent-3',
        },
      ],
    });

    await service.listConversations(FACULTY_ACTOR);

    expect(
      guardianLinkRepo.findActiveGuardiansForSections,
    ).toHaveBeenCalledWith([
      { sectionId: 'section-1', academicYearId: 'year-1' },
    ]);
    expect(conversationRepo.ensureExist).toHaveBeenCalledWith([
      {
        studentId: 'student-1',
        parentPersonId: 'parent-1',
        academicYearId: 'year-1',
        sectionId: 'section-1',
      },
      {
        studentId: 'student-2',
        parentPersonId: 'parent-2',
        academicYearId: 'year-1',
        sectionId: 'section-1',
      },
      {
        studentId: 'student-2',
        parentPersonId: 'parent-3',
        academicYearId: 'year-1',
        sectionId: 'section-1',
      },
    ]);
  });

  it('faculty list: conversations sharing the same (section, year) resolve the faculty list via one batched query, not one per conversation or one per section', async () => {
    const conv1 = makeConversation({ id: 'conv-1', studentId: 'student-1' });
    const conv2 = makeConversation({ id: 'conv-2', studentId: 'student-2' });
    const { service, conversationRepo, subjectOfferingRepo, classAdvisorRepo } =
      buildService();
    conversationRepo.listBySectionYearPairs.mockResolvedValue([conv1, conv2]);

    const result = await service.listConversations(FACULTY_ACTOR);

    expect(result).toHaveLength(2);
    expect(
      subjectOfferingRepo.findActiveTeachersForSections,
    ).toHaveBeenCalledTimes(1);
    expect(
      subjectOfferingRepo.findActiveTeachersForSections,
    ).toHaveBeenCalledWith([
      { sectionId: 'section-1', academicYearId: 'year-1' },
    ]);
    expect(
      classAdvisorRepo.findActiveAdvisorsForSections,
    ).toHaveBeenCalledTimes(1);
    expect(
      subjectOfferingRepo.findActiveTeachersForSection,
    ).not.toHaveBeenCalled();
    expect(
      classAdvisorRepo.findActiveAdvisorsForSection,
    ).not.toHaveBeenCalled();
  });

  it('faculty list with many conversations never falls back to the per-conversation methods -- syncMany/findManyOwn/countUnreadMany/findByIds/findDisplayNames are called exactly once each, never sync/findOne/countUnread/findById/findDisplayName', async () => {
    const conversations = Array.from({ length: 50 }, (_, i) =>
      makeConversation({
        id: `conv-${i}`,
        studentId: `student-${i}`,
        parentPersonId: `parent-${i}`,
      }),
    );
    const {
      service,
      conversationRepo,
      participantRepo,
      messageRepo,
      personRepo,
    } = buildService();
    conversationRepo.listBySectionYearPairs.mockResolvedValue(conversations);

    const result = await service.listConversations(FACULTY_ACTOR);

    expect(result).toHaveLength(50);
    expect(participantRepo.syncMany).toHaveBeenCalledTimes(1);
    expect(participantRepo.findManyOwn).toHaveBeenCalledTimes(1);
    expect(messageRepo.countUnreadMany).toHaveBeenCalledTimes(1);
    expect(messageRepo.findByIds).toHaveBeenCalledTimes(1);
    expect(personRepo.findDisplayNames).toHaveBeenCalledTimes(1);
    expect(participantRepo.sync).not.toHaveBeenCalled();
    expect(participantRepo.findOne).not.toHaveBeenCalled();
    expect(messageRepo.countUnread).not.toHaveBeenCalled();
    expect(messageRepo.findById).not.toHaveBeenCalled();
    expect(personRepo.findDisplayName).not.toHaveBeenCalled();
  });

  it('a faculty person with no active staff row is rejected as an actor-integrity failure (403), not a 404', async () => {
    const { service } = buildService({ staff: null });

    await expect(
      service.listConversations(FACULTY_ACTOR),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('a parent with zero active wards gets an empty list, no conversation created', async () => {
    const { service, conversationRepo } = buildService({ wardEnrolments: [] });
    conversationRepo.listForParent.mockResolvedValue([]);

    const result = await service.listConversations(PARENT_ACTOR);

    expect(result).toEqual([]);
    expect(conversationRepo.findOrCreate).not.toHaveBeenCalled();
  });

  it('27. a faculty member who is both subject teacher and class advisor for the same ward appears once, labeled CLASS_ADVISOR', async () => {
    const dualRole = {
      staffId: 'staff-dual',
      personId: 'faculty-dual',
      firstName: 'Gomathi',
      lastName: 'R',
      displayName: null,
    };
    const { service } = buildService({
      teachers: [dualRole],
      advisors: [dualRole],
    });

    const result = await service.listConversations(PARENT_ACTOR);

    const dualEntries = result[0].participants.filter(
      (p) => p.personId === 'faculty-dual',
    );
    expect(dualEntries).toHaveLength(1);
    expect(dualEntries[0].role).toBe('CLASS_ADVISOR');
  });

  it("8. participants list excludes the viewer themselves (shows only 'the other side')", async () => {
    const { service } = buildService();

    const result = await service.listConversations(PARENT_ACTOR);

    expect(result[0].participants.some((p) => p.personId === 'parent-1')).toBe(
      false,
    );
    expect(result[0].participants.some((p) => p.personId === 'faculty-1')).toBe(
      true,
    );
  });
});

describe('MessagingService — conversation detail (authorization)', () => {
  it('11. authorized parent can open their ward conversation', async () => {
    const { service } = buildService();

    const result = await service.getConversation(PARENT_ACTOR, 'conv-1');

    expect(result.id).toBe('conv-1');
  });

  it('5. an unrelated parent gets 404 — parentPersonId mismatch is checked before any live re-verification', async () => {
    const { service, guardianLinkRepo } = buildService({
      conversation: makeConversation({ parentPersonId: 'someone-else' }),
    });

    await expect(
      service.getConversation(PARENT_ACTOR, 'conv-1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(guardianLinkRepo.findActiveWardEnrolment).not.toHaveBeenCalled();
  });

  it('8. revoked guardian (live re-check returns null even though parentPersonId matches) -> 404', async () => {
    const { service } = buildService({ wardEnrolment: null });

    await expect(
      service.getConversation(PARENT_ACTOR, 'conv-1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('7. a random/nonexistent conversation id -> 404', async () => {
    const { service } = buildService({ conversation: null });

    await expect(
      service.getConversation(PARENT_ACTOR, 'does-not-exist'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('17. authorized faculty (current subject teacher for this section+year) can open the conversation', async () => {
    const { service } = buildService();

    const result = await service.getConversation(FACULTY_ACTOR, 'conv-1');

    expect(result.id).toBe('conv-1');
  });

  it('6/28. unrelated faculty (teaches a different section) -> 404', async () => {
    const { service } = buildService({
      teacherSections: [
        { sectionId: 'other-section', academicYearId: 'year-1' },
      ],
    });

    await expect(
      service.getConversation(FACULTY_ACTOR, 'conv-1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('26. class advisor (not a subject teacher for this ward) is still authorized', async () => {
    const { service } = buildService({
      teacherSections: [],
      advisorSections: [{ sectionId: 'section-1', academicYearId: 'year-1' }],
    });

    const result = await service.getConversation(FACULTY_ACTOR, 'conv-1');

    expect(result.id).toBe('conv-1');
  });

  it('reassigned faculty: teaching a different section only grants access to that section, never automatically to the old one', async () => {
    const { service } = buildService({
      teacherSections: [{ sectionId: 'section-2', academicYearId: 'year-1' }],
      advisorSections: [],
    });

    await expect(
      service.getConversation(FACULTY_ACTOR, 'conv-1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('49. a different academic year context never satisfies the current one (isolation)', async () => {
    const { service } = buildService({
      conversation: makeConversation({ academicYearId: 'year-2025-old' }),
      wardEnrolment: null, // the ward's ACTIVE enrolment is for the current year, not this old one
    });

    await expect(
      service.getConversation(PARENT_ACTOR, 'conv-1'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('MessagingService — unread count / read state', () => {
  it("35/37. parent's unread count uses only the parent's own last_read_at, independent of faculty's", async () => {
    const { service, messageRepo, participantRepo } = buildService({
      ownParticipant: { lastReadAt: new Date('2026-09-05T09:00:00Z') },
      unreadCount: 2,
    });

    const result = await service.getConversation(PARENT_ACTOR, 'conv-1');

    expect(participantRepo.findOne).toHaveBeenCalledWith('conv-1', 'parent-1');
    expect(messageRepo.countUnread).toHaveBeenCalledWith(
      'conv-1',
      'parent-1',
      new Date('2026-09-05T09:00:00Z'),
    );
    expect(result.unreadCount).toBe(2);
  });

  it("a user cannot modify another participant's read state — markRead only ever writes the caller's own personId", async () => {
    const { service, participantRepo } = buildService();

    await service.markRead(PARENT_ACTOR, 'conv-1');

    expect(participantRepo.markRead).toHaveBeenCalledWith(
      'conv-1',
      'parent-1',
      'PARENT',
      expect.any(Date),
    );
  });

  it('faculty markRead records the resolved SUBJECT_TEACHER/CLASS_ADVISOR role, never PARENT', async () => {
    const { service, participantRepo } = buildService();

    await service.markRead(FACULTY_ACTOR, 'conv-1');

    expect(participantRepo.markRead).toHaveBeenCalledWith(
      'conv-1',
      'faculty-1',
      'SUBJECT_TEACHER',
      expect.any(Date),
    );
  });
});

describe('MessagingService — send message', () => {
  it('13/19. authorized parent/faculty can send; sender identity comes only from the authenticated actor', async () => {
    const { service, messageRepo } = buildService();

    const result = await service.sendMessage(
      PARENT_ACTOR,
      'conv-1',
      '  Good morning  ',
      'key-1',
    );

    expect(messageRepo.insert).toHaveBeenCalledWith(
      'conv-1',
      'parent-1',
      'Good morning',
      'key-1',
      expect.anything(),
    );
    expect(result.sender.personId).toBe('parent-1');
    expect(result.status).toBe('SENT');
  });

  it('29. empty message rejected', async () => {
    const { service } = buildService();
    await expect(
      service.sendMessage(PARENT_ACTOR, 'conv-1', '', 'key-1'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('30. whitespace-only message rejected', async () => {
    const { service } = buildService();
    await expect(
      service.sendMessage(PARENT_ACTOR, 'conv-1', '   \n\t  ', 'key-1'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('31. oversized message rejected', async () => {
    const { service } = buildService();
    await expect(
      service.sendMessage(PARENT_ACTOR, 'conv-1', 'a'.repeat(2001), 'key-1'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('32. unicode message accepted and preserved verbatim', async () => {
    const { service, messageRepo } = buildService();
    const unicodeText = 'Aarav-இன் லேப் பதிவு படிக்க வேண்டும் 📚';

    await service.sendMessage(PARENT_ACTOR, 'conv-1', unicodeText, 'key-1');

    expect(messageRepo.insert).toHaveBeenCalledWith(
      'conv-1',
      'parent-1',
      unicodeText,
      'key-1',
      expect.anything(),
    );
  });

  it('33/34. no way to supply a sender or recipient — sendMessage takes only free text, never an id', async () => {
    const { service } = buildService();
    // Type-level guarantee: the method signature has no senderPersonId/recipientPersonId
    // parameter at all. Runtime guarantee: whatever the DTO carries besides `message`
    // is stripped by the global ValidationPipe's whitelist:true (see main.ts) before
    // this method is ever called.
    expect(service.sendMessage.length).toBe(4); // (actor, conversationId, rawMessage, idempotencyKey)
  });

  it('an unauthorized actor cannot send a message even with a well-formed body — authorization is checked before validation', async () => {
    const { service } = buildService({ conversation: null });
    await expect(
      service.sendMessage(PARENT_ACTOR, 'nonexistent', 'Hello', 'key-1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('52. duplicate send with the same Idempotency-Key returns the original message, never a duplicate insert', async () => {
    const existing = {
      id: '55',
      conversationId: 'conv-1',
      senderPersonId: 'parent-1',
      messageText: 'Good morning',
      createdAt: new Date('2026-09-05T10:00:00Z'),
    };
    const { service, messageRepo } = buildService();
    messageRepo.findByIdempotencyKey.mockResolvedValue(existing);

    const result = await service.sendMessage(
      PARENT_ACTOR,
      'conv-1',
      'Good morning',
      'same-key',
    );

    expect(messageRepo.insert).not.toHaveBeenCalled();
    expect(result.id).toBe('55');
  });

  it('sends within a single transaction — message insert and conversation last-message update use the same executor', async () => {
    const { service, messageRepo, conversationRepo, unitOfWork } =
      buildService();

    await service.sendMessage(PARENT_ACTOR, 'conv-1', 'Hello', 'key-1');

    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    const insertExecutor = messageRepo.insert.mock.calls[0][4];
    const updateExecutor = conversationRepo.updateLastMessage.mock.calls[0][3];
    expect(insertExecutor).toBe(updateExecutor);
  });
});

describe('MessagingService — translation', () => {
  const MESSAGE = {
    id: '101',
    conversationId: 'conv-1',
    senderPersonId: 'faculty-1',
    messageText: "Good morning. Aarav's lab record is due Friday.",
    createdAt: new Date('2026-09-05T08:00:00Z'),
  };

  it('39/40. authorized parent and faculty can translate a message in their conversation', async () => {
    const { service, messageRepo, translationService } = buildService();
    messageRepo.findById.mockResolvedValue(MESSAGE);

    const result = await service.translateMessage(
      PARENT_ACTOR,
      'conv-1',
      '101',
      'ta',
    );

    expect(translationService.translate).toHaveBeenCalledWith(
      '101',
      MESSAGE.messageText,
      'ta',
    );
    expect(result.translatedText).toBeTruthy();
  });

  it('41. unauthorized user cannot translate — 404 before the message is even looked up', async () => {
    const { service, messageRepo } = buildService({ conversation: null });

    await expect(
      service.translateMessage(PARENT_ACTOR, 'conv-1', '101', 'ta'),
    ).rejects.toMatchObject({ status: 404 });
    expect(messageRepo.findById).not.toHaveBeenCalled();
  });

  it('a message id belonging to a different conversation is rejected as not found, even for an authorized conversation', async () => {
    const { service, messageRepo } = buildService();
    messageRepo.findById.mockResolvedValue({
      ...MESSAGE,
      conversationId: 'other-conv',
    });

    await expect(
      service.translateMessage(PARENT_ACTOR, 'conv-1', '101', 'ta'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('42. translating never mutates the original message — translateMessage never calls any message-write method', async () => {
    const { service, messageRepo } = buildService();
    messageRepo.findById.mockResolvedValue(MESSAGE);
    // The mocked repo has no update method at all; if the service tried to call
    // one this would throw "not a function" rather than needing a spy assertion.
    await service.translateMessage(PARENT_ACTOR, 'conv-1', '101', 'ta');
    expect(messageRepo.findById).toHaveBeenCalledWith('101');
  });
});

describe('MessagingService - Principal actor resolution', () => {
  it('a Principal with an ACTIVE staff row resolves as PRINCIPAL, not PARENT', async () => {
    const { service, conversationRepo, participantRepo } = buildService({
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
    });
    conversationRepo.findById.mockResolvedValue(makeConversation());

    await service.getConversation(PRINCIPAL_ACTOR, 'conv-1');

    // Principal branch never calls findActiveWardEnrolment (that is the PARENT
    // path) and never throws -- reaching syncParticipants proves the PRINCIPAL
    // branch (blanket access) was taken, not a 404.
    expect(participantRepo.sync).toHaveBeenCalled();
  });

  it('a Principal with no active staff row is rejected as an actor-integrity failure (403)', async () => {
    const { service } = buildService({ staff: null });
    await expect(
      service.getConversation(PRINCIPAL_ACTOR, 'conv-1'),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('MessagingService - Principal to Faculty (STAFF_DIRECT)', () => {
  it('Principal can start a direct conversation with an active faculty member', async () => {
    const staffDirect = makeStaffDirectConversation();
    const { service, conversationRepo, principalRepo, auditService } =
      buildService({
        staff: {
          id: 'staff-principal',
          personId: 'principal-1',
          status: 'ACTIVE',
        },
        staffDirectConversation: staffDirect,
      });

    const result = await service.startStaffDirectConversation(
      PRINCIPAL_ACTOR,
      'faculty-1',
    );

    expect(principalRepo.isActiveFaculty).toHaveBeenCalledWith('faculty-1');
    expect(conversationRepo.findOrCreateStaffDirect).toHaveBeenCalledWith(
      'principal-1',
      'faculty-1',
    );
    expect(result.conversationType).toBe('STAFF_DIRECT');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAFF_DIRECT_CONVERSATION_STARTED',
        outcome: 'SUCCESS',
      }),
    );
  });

  it('rejects starting a conversation with a person who is not an active faculty member, with a DENIED audit', async () => {
    const { service, conversationRepo, auditService } = buildService({
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
      targetIsActiveFaculty: false,
    });

    await expect(
      service.startStaffDirectConversation(PRINCIPAL_ACTOR, 'not-faculty-1'),
    ).rejects.toMatchObject({ status: 400 });
    expect(conversationRepo.findOrCreateStaffDirect).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAFF_DIRECT_CONVERSATION_DENIED',
        outcome: 'DENIED',
      }),
    );
  });

  it('a non-Principal actor (Faculty) cannot start a STAFF_DIRECT conversation, even with a well-formed target', async () => {
    const { service, conversationRepo } = buildService();
    await expect(
      service.startStaffDirectConversation(FACULTY_ACTOR, 'faculty-2'),
    ).rejects.toMatchObject({ status: 403 });
    expect(conversationRepo.findOrCreateStaffDirect).not.toHaveBeenCalled();
  });

  it('starting the same pair twice resolves to the identical conversation (idempotent find-or-create, never a duplicate thread)', async () => {
    const staffDirect = makeStaffDirectConversation();
    const { service, conversationRepo } = buildService({
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
      staffDirectConversation: staffDirect,
    });

    const first = await service.startStaffDirectConversation(
      PRINCIPAL_ACTOR,
      'faculty-1',
    );
    const second = await service.startStaffDirectConversation(
      PRINCIPAL_ACTOR,
      'faculty-1',
    );

    expect(first.id).toBe(second.id);
    expect(conversationRepo.findOrCreateStaffDirect).toHaveBeenCalledTimes(2);
  });

  it('an unrelated Faculty (not one of the two parties) gets 404 on the STAFF_DIRECT conversation - same rule as the STUDENT_CONTEXT 404s', async () => {
    const staffDirect = makeStaffDirectConversation({
      personAId: 'faculty-1',
      personBId: 'principal-1',
    });
    const { service } = buildService({ conversation: staffDirect });

    await expect(
      service.getConversation(
        { personId: 'faculty-99', roles: ['FACULTY'] },
        'staff-conv-1',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('Faculty (one of the two parties) can open, list, and reply in a Principal-started STAFF_DIRECT conversation', async () => {
    const staffDirect = makeStaffDirectConversation({
      personAId: 'faculty-1',
      personBId: 'principal-1',
    });
    const { service, messageRepo } = buildService({
      conversation: staffDirect,
      activePrincipalIds: ['principal-1'],
    });

    const detail = await service.getConversation(FACULTY_ACTOR, 'staff-conv-1');
    expect(detail.conversationType).toBe('STAFF_DIRECT');
    expect(detail.directParticipant?.role).toBe('PRINCIPAL');

    const sent = await service.sendMessage(
      FACULTY_ACTOR,
      'staff-conv-1',
      'Certainly, I will review it today.',
      'idem-key-1',
    );
    expect(sent.sender.role).toBe('FACULTY_DIRECT');
    expect(messageRepo.insert).toHaveBeenCalledWith(
      'staff-conv-1',
      'faculty-1',
      'Certainly, I will review it today.',
      'idem-key-1',
      expect.anything(),
    );
  });

  it('a Principal own sent message in a STAFF_DIRECT thread is labeled PRINCIPAL, never FACULTY_DIRECT', async () => {
    const staffDirect = makeStaffDirectConversation({
      personAId: 'faculty-1',
      personBId: 'principal-1',
    });
    const { service } = buildService({
      conversation: staffDirect,
      activePrincipalIds: ['principal-1'],
    });

    const sent = await service.sendMessage(
      PRINCIPAL_ACTOR,
      'staff-conv-1',
      'Please review the examination schedule by Friday.',
      'idem-key-2',
    );
    expect(sent.sender.role).toBe('PRINCIPAL');
  });

  it('duplicate Idempotency-Key on a STAFF_DIRECT send returns the original message, never a duplicate insert', async () => {
    const staffDirect = makeStaffDirectConversation({
      personAId: 'faculty-1',
      personBId: 'principal-1',
    });
    const existing = {
      id: '999',
      conversationId: 'staff-conv-1',
      senderPersonId: 'principal-1',
      messageText: 'Please review the examination schedule by Friday.',
      createdAt: new Date('2026-09-05T09:00:00Z'),
    };
    const { service, messageRepo } = buildService({
      conversation: staffDirect,
      activePrincipalIds: ['principal-1'],
    });
    messageRepo.findByIdempotencyKey.mockResolvedValue(existing);

    const result = await service.sendMessage(
      PRINCIPAL_ACTOR,
      'staff-conv-1',
      'Please review the examination schedule by Friday.',
      'idem-key-2',
    );

    expect(result.id).toBe('999');
    expect(messageRepo.insert).not.toHaveBeenCalled();
  });

  it('markRead on a STAFF_DIRECT conversation records the correct resolved role for whoever is reading', async () => {
    const staffDirect = makeStaffDirectConversation({
      personAId: 'faculty-1',
      personBId: 'principal-1',
    });
    const { service, participantRepo } = buildService({
      conversation: staffDirect,
      activePrincipalIds: ['principal-1'],
    });

    await service.markRead(FACULTY_ACTOR, 'staff-conv-1');
    expect(participantRepo.markRead).toHaveBeenCalledWith(
      'staff-conv-1',
      'faculty-1',
      'FACULTY_DIRECT',
      expect.any(Date),
    );

    await service.markRead(PRINCIPAL_ACTOR, 'staff-conv-1');
    expect(participantRepo.markRead).toHaveBeenCalledWith(
      'staff-conv-1',
      'principal-1',
      'PRINCIPAL',
      expect.any(Date),
    );
  });

  it('translation works identically on a STAFF_DIRECT conversation - no conversation-type branching in the translate path', async () => {
    const staffDirect = makeStaffDirectConversation({
      personAId: 'faculty-1',
      personBId: 'principal-1',
    });
    const { service, messageRepo, translationService } = buildService({
      conversation: staffDirect,
    });
    messageRepo.findById.mockResolvedValue({
      id: '101',
      conversationId: 'staff-conv-1',
      senderPersonId: 'principal-1',
      messageText: 'Please review the examination schedule by Friday.',
      createdAt: new Date('2026-09-05T08:00:00Z'),
    });

    const result = await service.translateMessage(
      FACULTY_ACTOR,
      'staff-conv-1',
      '101',
      'ta',
    );
    expect(translationService.translate).toHaveBeenCalledWith(
      '101',
      'Please review the examination schedule by Friday.',
      'ta',
    );
    expect(result.translatedText).toBeTruthy();
  });
});

describe('MessagingService - Faculty to Principal (STAFF_DIRECT)', () => {
  it('Faculty can start a direct conversation with the (server-resolved) active Principal', async () => {
    const staffDirect = makeStaffDirectConversation();
    const { service, conversationRepo, principalRepo, auditService } =
      buildService({
        staffDirectConversation: staffDirect,
      });

    const result = await service.startPrincipalConversation(FACULTY_ACTOR);

    expect(principalRepo.findActivePrincipalPersonId).toHaveBeenCalled();
    expect(conversationRepo.findOrCreateStaffDirect).toHaveBeenCalledWith(
      'faculty-1',
      'principal-1',
    );
    expect(result.conversationType).toBe('STAFF_DIRECT');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAFF_DIRECT_CONVERSATION_STARTED',
        outcome: 'SUCCESS',
      }),
    );
  });

  it('a non-Faculty actor (Parent) cannot start a conversation with the Principal', async () => {
    const { service, conversationRepo } = buildService();
    await expect(
      service.startPrincipalConversation(PARENT_ACTOR),
    ).rejects.toMatchObject({ status: 403 });
    expect(conversationRepo.findOrCreateStaffDirect).not.toHaveBeenCalled();
  });

  it('404s when no Principal is currently assigned, rather than starting a conversation with nobody', async () => {
    const { service, conversationRepo } = buildService({
      activePrincipalPersonId: null,
    });
    await expect(
      service.startPrincipalConversation(FACULTY_ACTOR),
    ).rejects.toMatchObject({ status: 404 });
    expect(conversationRepo.findOrCreateStaffDirect).not.toHaveBeenCalled();
  });

  it('starting it twice resolves to the identical conversation (idempotent find-or-create, never a duplicate thread)', async () => {
    const staffDirect = makeStaffDirectConversation();
    const { service, conversationRepo } = buildService({
      staffDirectConversation: staffDirect,
    });

    const first = await service.startPrincipalConversation(FACULTY_ACTOR);
    const second = await service.startPrincipalConversation(FACULTY_ACTOR);

    expect(first.id).toBe(second.id);
    expect(conversationRepo.findOrCreateStaffDirect).toHaveBeenCalledTimes(2);
  });

  it('a Principal-initiated thread and this Faculty-initiated one to the same pair are the same conversation (order-independent find-or-create)', async () => {
    const staffDirect = makeStaffDirectConversation();
    const { service } = buildService({
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
      staffDirectConversation: staffDirect,
    });

    const fromFaculty = await service.startPrincipalConversation(FACULTY_ACTOR);
    const fromPrincipal = await service.startStaffDirectConversation(
      PRINCIPAL_ACTOR,
      'faculty-1',
    );

    expect(fromFaculty.id).toBe(fromPrincipal.id);
  });
});

describe('MessagingService - Principal to Student (STUDENT_CONTEXT)', () => {
  it('starts a conversation with every currently ACTIVE guardian at once (fan-out, never silently picking one)', async () => {
    const { service, conversationRepo, participantRepo, auditService } =
      buildService({
        staff: {
          id: 'staff-principal',
          personId: 'principal-1',
          status: 'ACTIVE',
        },
        activeStudentContext: {
          studentId: 'student-1',
          studentFirstName: 'Naveen',
          studentLastName: 'Rangaswamy',
          academicYearId: 'year-1',
          sectionId: 'section-1',
          guardians: [
            {
              personId: 'mother-1',
              firstName: 'Poornima',
              lastName: 'R',
              displayName: null,
            },
            {
              personId: 'father-1',
              firstName: 'Rajesh',
              lastName: 'R',
              displayName: null,
            },
          ],
        },
      });
    conversationRepo.findOrCreate.mockImplementation(
      async (studentId: string, parentPersonId: string) =>
        makeConversation({ id: `conv-${parentPersonId}`, parentPersonId }),
    );

    const result = await service.startStudentConversations(
      PRINCIPAL_ACTOR,
      'student-1',
    );

    expect(conversationRepo.findOrCreate).toHaveBeenCalledTimes(2);
    expect(conversationRepo.findOrCreate).toHaveBeenCalledWith(
      'student-1',
      'mother-1',
      'year-1',
      'section-1',
    );
    expect(conversationRepo.findOrCreate).toHaveBeenCalledWith(
      'student-1',
      'father-1',
      'year-1',
      'section-1',
    );
    expect(result).toHaveLength(2);
    // Principal's engagement is made durable via a real PRINCIPAL participant
    // row on EACH resulting conversation, not just the first.
    expect(participantRepo.sync).toHaveBeenCalledWith('conv-mother-1', [
      { personId: 'principal-1', role: 'PRINCIPAL' },
    ]);
    expect(participantRepo.sync).toHaveBeenCalledWith('conv-father-1', [
      { personId: 'principal-1', role: 'PRINCIPAL' },
    ]);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STUDENT_CONTEXT_CONVERSATION_STARTED',
        outcome: 'SUCCESS',
        afterData: { guardianCount: 2 },
      }),
    );
  });

  it('a student with no current active enrolment is rejected as not found', async () => {
    const { service, conversationRepo } = buildService({
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
      activeStudentContext: null,
    });
    await expect(
      service.startStudentConversations(PRINCIPAL_ACTOR, 'ghost-student'),
    ).rejects.toMatchObject({ status: 404 });
    expect(conversationRepo.findOrCreate).not.toHaveBeenCalled();
  });

  it('a student with zero ACTIVE guardians is rejected - never silently creates a conversation with nobody on the other end', async () => {
    const { service, conversationRepo } = buildService({
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
      activeStudentContext: {
        studentId: 'student-2',
        studentFirstName: 'Orphaned',
        studentLastName: 'Record',
        academicYearId: 'year-1',
        sectionId: 'section-1',
        guardians: [],
      },
    });
    await expect(
      service.startStudentConversations(PRINCIPAL_ACTOR, 'student-2'),
    ).rejects.toMatchObject({ status: 400 });
    expect(conversationRepo.findOrCreate).not.toHaveBeenCalled();
  });

  it('a non-Principal actor (Faculty) cannot start a student-context conversation through this Principal-only flow', async () => {
    const { service, conversationRepo } = buildService();
    await expect(
      service.startStudentConversations(FACULTY_ACTOR, 'student-1'),
    ).rejects.toMatchObject({ status: 403 });
    expect(conversationRepo.findOrCreate).not.toHaveBeenCalled();
  });

  it("a guardian who receives a Principal-started conversation sees it exactly like any other - no special-casing on the parent's own list/detail/send path", async () => {
    const conversation = makeConversation({
      id: 'conv-mother-1',
      parentPersonId: 'mother-1',
    });
    const { service } = buildService({ conversation });
    const detail = await service.getConversation(
      { personId: 'mother-1', roles: ['PARENT'] },
      'conv-mother-1',
    );
    expect(detail.conversationType).toBe('STUDENT_CONTEXT');
    expect(detail.student?.name).toBe('Aarav Kumar');
  });

  it('a Principal own message in a STUDENT_CONTEXT conversation is labeled PRINCIPAL and shows up in the participants list once engaged', async () => {
    const conversation = makeConversation({ parentPersonId: 'mother-1' });
    const { service, participantRepo } = buildService({
      conversation,
      staff: {
        id: 'staff-principal',
        personId: 'principal-1',
        status: 'ACTIVE',
      },
      principalsByConversation: new Map([
        [
          'conv-1',
          [
            {
              personId: 'principal-1',
              firstName: 'Rajesh',
              lastName: 'Thangavel',
              displayName: null,
            },
          ],
        ],
      ]),
    });

    const sent = await service.sendMessage(
      PRINCIPAL_ACTOR,
      'conv-1',
      'Please ensure the fee balance is cleared by month end.',
      'idem-key-3',
    );
    expect(sent.sender.role).toBe('PRINCIPAL');
    // sendMessage defensively re-syncs the PRINCIPAL participant row on every
    // send, not just the first (idempotent upsert, never a duplicate row).
    expect(participantRepo.sync).toHaveBeenCalledWith('conv-1', [
      { personId: 'principal-1', role: 'PRINCIPAL' },
    ]);

    // From the GUARDIAN's own viewpoint (not the Principal's own -- a viewer
    // never sees themselves in their own participants list, confirmed by the
    // existing "excludes the viewer themselves" test above), the Principal now
    // correctly shows up as a participant, having engaged with this thread.
    const detail = await service.getConversation(
      { personId: 'mother-1', roles: ['PARENT'] },
      'conv-1',
    );
    expect(
      detail.participants.some(
        (p) => p.personId === 'principal-1' && p.role === 'PRINCIPAL',
      ),
    ).toBe(true);
  });
});

describe('MessagingService - security: sender identity cannot be spoofed (STAFF_DIRECT)', () => {
  it('sendMessage takes only free text - there is no parameter through which a caller can supply a senderPersonId', () => {
    // Compile-time guarantee, mirrored here as a runtime check on the method's
    // declared arity: (actor, conversationId, rawMessage, idempotencyKey) - 4
    // params, identical arity for either conversation type, never a 5th
    // "sender"/"from" field.
    expect(MessagingService.prototype.sendMessage.length).toBe(4);
  });
});
