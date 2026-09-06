// Parent <-> Faculty messaging orchestration. The single most important invariant
// in this file: conversation_participant rows are NEVER trusted as authorization —
// every access re-derives "is this actor currently allowed here" live from
// guardian_link + student_enrolment + subject_offering + role_assignment, on every
// single request (list/detail/messages/send/read/translate all funnel through
// getAuthorizedConversationOrThrow). A stale participant row from before a faculty
// reassignment or a guardian revocation can never grant access on its own.
//
// A person holding both FACULTY and PARENT roles is treated as FACULTY throughout,
// mirroring the exact precedent already established in
// OnlineClassesController.list/detail ("keeps getting exactly the existing Faculty
// behavior").

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { MESSAGING_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ClassAdvisorRepository } from './repositories/class-advisor.repository';
import {
  ConversationParticipantRepository,
  ParticipantRole,
} from './repositories/conversation-participant.repository';
import {
  ConversationRepository,
  ConversationView,
} from './repositories/conversation.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import {
  MessageRepository,
  MessageView,
} from './repositories/message.repository';
import { PersonRepository } from './repositories/person.repository';
import { StaffRepository } from './repositories/staff.repository';
import {
  SectionYearContext,
  SubjectOfferingRepository,
} from './repositories/subject-offering.repository';
import {
  TranslationService,
  TranslateMessageResult,
} from './translation/translation.service';

export interface ParticipantSummaryDto {
  personId: string;
  name: string;
  role: ParticipantRole;
}

export interface MessageSummaryDto {
  id: string;
  senderPersonId: string;
  text: string;
  createdAt: string;
}

export interface ConversationSummaryDto {
  id: string;
  student: { id: string; name: string };
  grade: { name: string };
  section: { name: string };
  academicYear: { id: string; name: string };
  participants: ParticipantSummaryDto[];
  lastMessage: MessageSummaryDto | null;
  unreadCount: number;
  lastMessageAt: string | null;
}

export interface ConversationDetailDto extends ConversationSummaryDto {
  ownLastReadAt: string | null;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  sender: { personId: string; name: string; role: ParticipantRole };
  text: string;
  createdAt: string;
  readAt: string | null;
  status: 'SENT';
}

interface ActorContext {
  role: 'PARENT' | 'FACULTY';
  staffId?: string;
}

const MESSAGE_PAGE_DEFAULT_LIMIT = 30;

@Injectable()
export class MessagingService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly staffRepo: StaffRepository,
    private readonly subjectOfferingRepo: SubjectOfferingRepository,
    private readonly classAdvisorRepo: ClassAdvisorRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly participantRepo: ConversationParticipantRepository,
    private readonly messageRepo: MessageRepository,
    private readonly personRepo: PersonRepository,
    private readonly translationService: TranslationService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ---- Role/identity resolution --------------------------------------------------

  private async resolveActorContext(
    actor: AuthenticatedUser,
  ): Promise<ActorContext> {
    if (actor.roles.includes('FACULTY')) {
      const staff = await this.staffRepo.findByPersonId(actor.personId);
      if (!staff || staff.status !== 'ACTIVE') {
        throw new ForbiddenException(MESSAGING_ERRORS.NOT_ACTIVE_FACULTY);
      }
      return { role: 'FACULTY', staffId: staff.id };
    }
    return { role: 'PARENT' };
  }

  // ---- Live authorization derivation ----------------------------------------------

  /** Union of active subject teachers + active class advisor(s) for one section+year,
   * deduplicated by personId. A person who is both keeps a single entry, labeled
   * CLASS_ADVISOR (the more encompassing role) — never a duplicate participant.
   *
   * `cache` is an optional per-request memoization Map, keyed by
   * `sectionId:academicYearId` — listConversations shares one across its whole
   * loop, since many conversations (every student in the same section) share the
   * identical faculty list; every other call site omits it and gets a fresh,
   * always-current lookup (correctness there matters more than one saved query). */
  private async deriveAuthorizedFaculty(
    sectionId: string,
    academicYearId: string,
    cache?: Map<
      string,
      { personId: string; name: string; role: ParticipantRole }[]
    >,
  ): Promise<{ personId: string; name: string; role: ParticipantRole }[]> {
    const key = `${sectionId}:${academicYearId}`;
    const cached = cache?.get(key);
    if (cached) return cached;

    const [teachers, advisors] = await Promise.all([
      this.subjectOfferingRepo.findActiveTeachersForSection(
        sectionId,
        academicYearId,
      ),
      this.classAdvisorRepo.findActiveAdvisorsForSection(sectionId),
    ]);

    const byPerson = new Map<
      string,
      { personId: string; name: string; role: ParticipantRole }
    >();
    for (const t of teachers) {
      byPerson.set(t.personId, {
        personId: t.personId,
        name: displayNameOf(t),
        role: 'SUBJECT_TEACHER',
      });
    }
    for (const a of advisors) {
      // Overwrites a SUBJECT_TEACHER entry for the same person, if present —
      // CLASS_ADVISOR takes precedence, and this is exactly how the dual-role case
      // collapses to one row instead of two.
      byPerson.set(a.personId, {
        personId: a.personId,
        name: displayNameOf(a),
        role: 'CLASS_ADVISOR',
      });
    }
    const result = [...byPerson.values()];
    cache?.set(key, result);
    return result;
  }

  /** Every (section, academic_year) this faculty is currently authorized for, via
   * either path, deduplicated. */
  private async deriveAuthorizedSections(
    staffId: string,
    personId: string,
  ): Promise<SectionYearContext[]> {
    const [teaching, advising] = await Promise.all([
      this.subjectOfferingRepo.findActiveSectionsForTeacher(staffId),
      this.classAdvisorRepo.findActiveSectionsForAdvisor(personId),
    ]);
    const seen = new Map<string, SectionYearContext>();
    for (const ctx of [...teaching, ...advising]) {
      seen.set(`${ctx.sectionId}:${ctx.academicYearId}`, ctx);
    }
    return [...seen.values()];
  }

  // ---- The one authorization gate every endpoint funnels through -----------------

  /** Loads the conversation, re-verifies the actor is CURRENTLY authorized for it
   * (never trusting a stored participant row), and keeps conversation_participant
   * in sync with the live-derived set. Throws the identical 404 whether the
   * conversation doesn't exist, belongs to someone else, or the actor's
   * authorization has since lapsed — never distinguishable (Step 3/21/22/27). */
  private async getAuthorizedConversationOrThrow(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<{ conversation: ConversationView; actorContext: ActorContext }> {
    const actorContext = await this.resolveActorContext(actor);
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
    }

    if (actorContext.role === 'PARENT') {
      if (conversation.parentPersonId !== actor.personId) {
        throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
      }
      const stillActive = await this.guardianLinkRepo.findActiveWardEnrolment(
        actor.personId,
        conversation.studentId,
        conversation.academicYearId,
        conversation.sectionId,
      );
      if (!stillActive) {
        throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
      }
    } else {
      const authorizedSections = await this.deriveAuthorizedSections(
        actorContext.staffId as string,
        actor.personId,
      );
      const stillAuthorized = authorizedSections.some(
        (s) =>
          s.sectionId === conversation.sectionId &&
          s.academicYearId === conversation.academicYearId,
      );
      if (!stillAuthorized) {
        throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
      }
    }

    await this.syncParticipants(conversation);
    return { conversation, actorContext };
  }

  // Runs against the plain pool (default executor) — this is a best-effort display/
  // read-state cache refresh, not part of the authorization decision itself (which
  // has already happened by the time this is called).
  private async syncParticipants(
    conversation: ConversationView,
    facultyCache?: Map<
      string,
      { personId: string; name: string; role: ParticipantRole }[]
    >,
  ): Promise<void> {
    const faculty = await this.deriveAuthorizedFaculty(
      conversation.sectionId,
      conversation.academicYearId,
      facultyCache,
    );
    await this.participantRepo.sync(conversation.id, [
      {
        personId: conversation.parentPersonId,
        role: 'PARENT' as ParticipantRole,
      },
      ...faculty.map((f) => ({ personId: f.personId, role: f.role })),
    ]);
  }

  // ---- Conversation list -----------------------------------------------------------

  async listConversations(
    actor: AuthenticatedUser,
  ): Promise<ConversationSummaryDto[]> {
    const actorContext = await this.resolveActorContext(actor);

    let conversations: ConversationView[];
    if (actorContext.role === 'PARENT') {
      const wards = await this.guardianLinkRepo.findActiveWardEnrolments(
        actor.personId,
      );
      for (const ward of wards) {
        await this.conversationRepo.findOrCreate(
          ward.studentId,
          actor.personId,
          ward.academicYearId,
          ward.sectionId,
        );
      }
      conversations = await this.conversationRepo.listForParent(actor.personId);
    } else {
      const sections = await this.deriveAuthorizedSections(
        actorContext.staffId as string,
        actor.personId,
      );
      // Every ACTIVE (student, guardian) pair across every section this faculty
      // teaches or advises gets a conversation up front -- so every student in
      // their class is searchable/messageable immediately, never only the ones
      // whose parent happened to open the app first.
      const pairs =
        await this.guardianLinkRepo.findActiveGuardiansForSections(sections);
      await this.conversationRepo.ensureExist(
        pairs.map((p) => ({
          studentId: p.studentId,
          parentPersonId: p.parentPersonId,
          academicYearId: p.academicYearId,
          sectionId: p.sectionId,
        })),
      );
      conversations =
        await this.conversationRepo.listBySectionYearPairs(sections);
    }

    return this.buildSummariesBulk(conversations, actor.personId);
  }

  /** The list-summary path -- deliberately NOT one syncParticipants()/
   * toSummaryDto() call per conversation (see those methods' own docs): a
   * faculty's list can now span hundreds of conversations (every student in
   * every section they teach, per the Faculty auto-creation above), and the
   * per-conversation path was measured to time out well before that. Every
   * per-conversation cost here is batched into a small, fixed number of queries
   * regardless of how many conversations there are. Single-conversation call
   * sites (getConversation, sendMessage, etc.) keep using
   * syncParticipants()/toSummaryDto() directly -- there's exactly one
   * conversation there, so batching would only add complexity for no benefit. */
  private async buildSummariesBulk(
    conversations: ConversationView[],
    viewerPersonId: string,
  ): Promise<ConversationSummaryDto[]> {
    if (conversations.length === 0) return [];

    // 1. Faculty list per distinct (section, year) -- ONE query for teachers and
    // ONE for advisors across every distinct section, not one pair of queries per
    // section (that alone was 16 sequential round trips for an 8-section faculty,
    // the single biggest remaining cost after batching steps 2-6 below).
    const distinctSectionYears = new Map<
      string,
      { sectionId: string; academicYearId: string }
    >();
    for (const c of conversations) {
      distinctSectionYears.set(`${c.sectionId}:${c.academicYearId}`, {
        sectionId: c.sectionId,
        academicYearId: c.academicYearId,
      });
    }
    const pairs = [...distinctSectionYears.values()];
    const [teachersBySectionYear, advisorsBySection] = await Promise.all([
      this.subjectOfferingRepo.findActiveTeachersForSections(pairs),
      this.classAdvisorRepo.findActiveAdvisorsForSections(
        pairs.map((p) => p.sectionId),
      ),
    ]);
    const facultyCache = new Map<
      string,
      { personId: string; name: string; role: ParticipantRole }[]
    >();
    for (const [key, pair] of distinctSectionYears) {
      const byPerson = new Map<
        string,
        { personId: string; name: string; role: ParticipantRole }
      >();
      for (const t of teachersBySectionYear.get(key) ?? []) {
        byPerson.set(t.personId, {
          personId: t.personId,
          name: displayNameOf(t),
          role: 'SUBJECT_TEACHER',
        });
      }
      for (const a of advisorsBySection.get(pair.sectionId) ?? []) {
        byPerson.set(a.personId, {
          personId: a.personId,
          name: displayNameOf(a),
          role: 'CLASS_ADVISOR',
        });
      }
      facultyCache.set(key, [...byPerson.values()]);
    }

    // 2. Bulk-sync every (conversation, participant) row in one INSERT.
    const syncRows: {
      conversationId: string;
      personId: string;
      role: ParticipantRole;
    }[] = [];
    for (const c of conversations) {
      const faculty =
        facultyCache.get(`${c.sectionId}:${c.academicYearId}`) ?? [];
      syncRows.push({
        conversationId: c.id,
        personId: c.parentPersonId,
        role: 'PARENT',
      });
      for (const f of faculty)
        syncRows.push({
          conversationId: c.id,
          personId: f.personId,
          role: f.role,
        });
    }
    // 2. Bulk-sync participants, 3. bulk own read-state, 5. bulk last messages,
    // 6. bulk parent display names -- four independent queries, run concurrently
    // rather than chained (each one is a real network round trip to a remote
    // Supabase pooler, where latency -- not query count alone -- dominates).
    // 4. Bulk unread counts genuinely depends on (3)'s result, so it follows after.
    const conversationIds = conversations.map((c) => c.id);
    const lastMessageIds = [
      ...new Set(
        conversations
          .map((c) => c.lastMessageId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const parentIds = [
      ...new Set(
        conversations
          .map((c) => c.parentPersonId)
          .filter((id) => id !== viewerPersonId),
      ),
    ];

    const [, ownReadByConversation, lastMessages, parentNames] =
      await Promise.all([
        this.participantRepo.syncMany(syncRows),
        this.participantRepo.findManyOwn(conversationIds, viewerPersonId),
        this.messageRepo.findByIds(lastMessageIds),
        this.personRepo.findDisplayNames(parentIds),
      ]);
    const lastMessageById = new Map(lastMessages.map((m) => [m.id, m]));

    const unreadByConversation = await this.messageRepo.countUnreadMany(
      conversations.map((c) => ({
        conversationId: c.id,
        excludePersonId: viewerPersonId,
        sinceExclusive: ownReadByConversation.get(c.id) ?? null,
      })),
    );

    return conversations.map((c) => {
      const faculty =
        facultyCache.get(`${c.sectionId}:${c.academicYearId}`) ?? [];
      const parentName =
        c.parentPersonId === viewerPersonId
          ? ''
          : parentNames.get(c.parentPersonId)
            ? displayNameOf(parentNames.get(c.parentPersonId)!)
            : 'Parent';
      const allMembers: {
        personId: string;
        name: string;
        role: ParticipantRole;
      }[] = [
        { personId: c.parentPersonId, name: parentName, role: 'PARENT' },
        ...faculty,
      ];
      const participants = allMembers.filter(
        (m) => m.personId !== viewerPersonId,
      );
      const lastMessage = c.lastMessageId
        ? (lastMessageById.get(c.lastMessageId) ?? null)
        : null;

      return {
        id: c.id,
        student: {
          id: c.studentId,
          name: `${c.studentFirstName} ${c.studentLastName}`.trim(),
        },
        grade: { name: c.gradeName },
        section: { name: c.sectionName },
        academicYear: { id: c.academicYearId, name: c.academicYearName },
        participants,
        lastMessage: lastMessage ? this.toMessageSummary(lastMessage) : null,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      };
    });
  }

  async getConversation(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationDetailDto> {
    const { conversation } = await this.getAuthorizedConversationOrThrow(
      actor,
      conversationId,
    );
    const summary = await this.toSummaryDto(conversation, actor.personId);
    const own = await this.participantRepo.findOne(
      conversation.id,
      actor.personId,
    );
    return {
      ...summary,
      ownLastReadAt: own?.lastReadAt?.toISOString() ?? null,
    };
  }

  private async toSummaryDto(
    conversation: ConversationView,
    viewerPersonId: string,
    facultyCache?: Map<
      string,
      { personId: string; name: string; role: ParticipantRole }[]
    >,
  ): Promise<ConversationSummaryDto> {
    const faculty = await this.deriveAuthorizedFaculty(
      conversation.sectionId,
      conversation.academicYearId,
      facultyCache,
    );
    const allMembers: {
      personId: string;
      name: string;
      role: ParticipantRole;
    }[] = [
      {
        personId: conversation.parentPersonId,
        name: await this.resolveParentName(conversation),
        role: 'PARENT',
      },
      ...faculty,
    ];
    // The viewer already knows who they are — show only "the other side" (Step 8's
    // example response, from the parent's perspective, lists only faculty).
    const participants = allMembers.filter(
      (m) => m.personId !== viewerPersonId,
    );

    const own = await this.participantRepo.findOne(
      conversation.id,
      viewerPersonId,
    );
    const unreadCount = await this.messageRepo.countUnread(
      conversation.id,
      viewerPersonId,
      own?.lastReadAt ?? null,
    );

    const lastMessage = conversation.lastMessageId
      ? await this.messageRepo.findById(conversation.lastMessageId)
      : null;

    return {
      id: conversation.id,
      student: {
        id: conversation.studentId,
        name: `${conversation.studentFirstName} ${conversation.studentLastName}`.trim(),
      },
      grade: { name: conversation.gradeName },
      section: { name: conversation.sectionName },
      academicYear: {
        id: conversation.academicYearId,
        name: conversation.academicYearName,
      },
      participants,
      lastMessage: lastMessage ? this.toMessageSummary(lastMessage) : null,
      unreadCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    };
  }

  private async resolveParentName(
    conversation: ConversationView,
  ): Promise<string> {
    const person = await this.personRepo.findDisplayName(
      conversation.parentPersonId,
    );
    return person ? displayNameOf(person) : 'Parent';
  }

  private toMessageSummary(message: MessageView): MessageSummaryDto {
    return {
      id: message.id,
      senderPersonId: message.senderPersonId,
      text: message.messageText,
      createdAt: message.createdAt.toISOString(),
    };
  }

  // ---- Message history ---------------------------------------------------------

  async listMessages(
    actor: AuthenticatedUser,
    conversationId: string,
    limit: number | undefined,
    before: string | undefined,
  ): Promise<{
    items: MessageDto[];
    meta: { hasMore: boolean; nextCursor: string | null };
  }> {
    const { conversation } = await this.getAuthorizedConversationOrThrow(
      actor,
      conversationId,
    );

    const page = await this.messageRepo.listPage(
      conversationId,
      limit ?? MESSAGE_PAGE_DEFAULT_LIMIT,
      before,
    );
    const chronological = [...page.items].reverse();

    // Read-receipt semantics: only ever shown for the VIEWER's OWN sent messages
    // (matches real chat UX — you don't need a read receipt on messages you're
    // currently reading). "Read" means every currently-authorized member of the
    // opposite side has read it; a single faculty's read state is never
    // conflated with another's, and nothing is fabricated for anyone else's
    // messages.
    const parentReadAt =
      (
        await this.participantRepo.findOne(
          conversationId,
          conversation.parentPersonId,
        )
      )?.lastReadAt ?? null;
    const faculty = await this.deriveAuthorizedFaculty(
      conversation.sectionId,
      conversation.academicYearId,
    );
    const facultyReadAts = await Promise.all(
      faculty.map((f) =>
        this.participantRepo.findOne(conversationId, f.personId),
      ),
    );
    const allFacultyReadAt =
      faculty.length > 0 && facultyReadAts.every((r) => r?.lastReadAt)
        ? facultyReadAts.reduce<Date>(
            (min, r) => (r!.lastReadAt! < min ? r!.lastReadAt! : min),
            facultyReadAts[0]!.lastReadAt!,
          )
        : null;

    const items = await Promise.all(
      chronological.map(async (message) => {
        const senderRole = await this.roleOf(
          conversation,
          message.senderPersonId,
          faculty,
        );
        const senderName = await this.nameOf(
          conversation,
          message.senderPersonId,
          faculty,
        );

        let readAt: Date | null = null;
        if (message.senderPersonId === actor.personId) {
          if (actor.personId === conversation.parentPersonId) {
            readAt =
              allFacultyReadAt && allFacultyReadAt >= message.createdAt
                ? allFacultyReadAt
                : null;
          } else {
            readAt =
              parentReadAt && parentReadAt >= message.createdAt
                ? parentReadAt
                : null;
          }
        }

        return {
          id: message.id,
          conversationId: message.conversationId,
          sender: {
            personId: message.senderPersonId,
            name: senderName,
            role: senderRole,
          },
          text: message.messageText,
          createdAt: message.createdAt.toISOString(),
          readAt: readAt?.toISOString() ?? null,
          status: 'SENT' as const,
        };
      }),
    );

    return {
      items,
      meta: {
        hasMore: page.hasMore,
        nextCursor: page.hasMore ? chronological[0]!.id : null,
      },
    };
  }

  private async roleOf(
    conversation: ConversationView,
    personId: string,
    faculty: { personId: string; role: ParticipantRole }[],
  ): Promise<ParticipantRole> {
    if (personId === conversation.parentPersonId) return 'PARENT';
    return (
      faculty.find((f) => f.personId === personId)?.role ?? 'SUBJECT_TEACHER'
    );
  }

  private async nameOf(
    conversation: ConversationView,
    personId: string,
    faculty: { personId: string; name: string }[],
  ): Promise<string> {
    if (personId === conversation.parentPersonId)
      return this.resolveParentName(conversation);
    const known = faculty.find((f) => f.personId === personId);
    if (known) return known.name;
    const person = await this.personRepo.findDisplayName(personId);
    return person ? displayNameOf(person) : 'Unknown';
  }

  // ---- Send message ---------------------------------------------------------------

  async sendMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    rawMessage: string,
    idempotencyKey: string,
  ): Promise<MessageDto> {
    const { conversation, actorContext } =
      await this.getAuthorizedConversationOrThrow(actor, conversationId);

    const trimmed = rawMessage.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(MESSAGING_ERRORS.EMPTY_MESSAGE);
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException(MESSAGING_ERRORS.MESSAGE_TOO_LONG);
    }

    const message = await this.unitOfWork.run(async (client) => {
      const existing = await this.messageRepo.findByIdempotencyKey(
        conversationId,
        actor.personId,
        idempotencyKey,
        client,
      );
      if (existing) return existing;

      const inserted = await this.messageRepo.insert(
        conversationId,
        actor.personId,
        trimmed,
        idempotencyKey,
        client,
      );
      await this.conversationRepo.updateLastMessage(
        conversationId,
        inserted.id,
        inserted.createdAt,
        client,
      );
      return inserted;
    });

    const role: ParticipantRole =
      actorContext.role === 'PARENT'
        ? 'PARENT'
        : await this.roleForFaculty(conversation, actor.personId);
    const senderName = await this.nameOf(
      conversation,
      actor.personId,
      await this.deriveAuthorizedFaculty(
        conversation.sectionId,
        conversation.academicYearId,
      ),
    );

    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: { personId: actor.personId, name: senderName, role },
      text: message.messageText,
      createdAt: message.createdAt.toISOString(),
      readAt: null,
      status: 'SENT',
    };
  }

  private async roleForFaculty(
    conversation: ConversationView,
    personId: string,
  ): Promise<ParticipantRole> {
    const faculty = await this.deriveAuthorizedFaculty(
      conversation.sectionId,
      conversation.academicYearId,
    );
    return (
      faculty.find((f) => f.personId === personId)?.role ?? 'SUBJECT_TEACHER'
    );
  }

  // ---- Read state ------------------------------------------------------------------

  async markRead(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<void> {
    const { conversation, actorContext } =
      await this.getAuthorizedConversationOrThrow(actor, conversationId);
    const role: ParticipantRole =
      actorContext.role === 'PARENT'
        ? 'PARENT'
        : await this.roleForFaculty(conversation, actor.personId);
    await this.participantRepo.markRead(
      conversationId,
      actor.personId,
      role,
      new Date(),
    );
  }

  // ---- Translation -------------------------------------------------------------

  async translateMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    targetLanguage: string,
  ): Promise<TranslateMessageResult> {
    await this.getAuthorizedConversationOrThrow(actor, conversationId);

    const message = await this.messageRepo.findById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException(MESSAGING_ERRORS.MESSAGE_NOT_FOUND);
    }

    return this.translationService.translate(
      message.id,
      message.messageText,
      targetLanguage,
    );
  }
}

function displayNameOf(person: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
}): string {
  return (
    person.displayName?.trim() ||
    `${person.firstName} ${person.lastName}`.trim()
  );
}
