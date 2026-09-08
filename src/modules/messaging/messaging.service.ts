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
import { AuditService } from '../../common/audit/audit.service';
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
import { PrincipalRepository } from './repositories/principal.repository';
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

// student/grade/section/academicYear are populated for a STUDENT_CONTEXT
// conversation and absent for a STAFF_DIRECT one; directParticipant is the
// reverse. Every existing STUDENT_CONTEXT response keeps returning exactly the
// same fields as before this type existed -- this widening is purely additive.
export interface ConversationSummaryDto {
  id: string;
  conversationType: 'STUDENT_CONTEXT' | 'STAFF_DIRECT';
  student?: { id: string; name: string };
  grade?: { name: string };
  section?: { name: string };
  academicYear?: { id: string; name: string };
  directParticipant?: { personId: string; name: string; role: ParticipantRole };
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

// PRINCIPAL: authorized for ANY STUDENT_CONTEXT conversation unconditionally
// (never scoped to a section/subject the way FACULTY is), and for any
// STAFF_DIRECT conversation they're one of the two parties of. Carries staffId
// for audit/actor-identity purposes only, mirroring FACULTY.
interface ActorContext {
  role: 'PARENT' | 'FACULTY' | 'PRINCIPAL';
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
    private readonly principalRepo: PrincipalRepository,
    private readonly translationService: TranslationService,
    private readonly auditService: AuditService,
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
    if (actor.roles.includes('PRINCIPAL')) {
      const staff = await this.staffRepo.findByPersonId(actor.personId);
      if (!staff || staff.status !== 'ACTIVE') {
        throw new ForbiddenException(MESSAGING_ERRORS.NOT_ACTIVE_PRINCIPAL);
      }
      return { role: 'PRINCIPAL', staffId: staff.id };
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

    // STAFF_DIRECT has no live re-derivation the way a teaching assignment does --
    // the pair is fixed at creation, so "is the actor one of the two" is the
    // entire authorization decision, for either party (Principal or Faculty).
    if (conversation.conversationType === 'STAFF_DIRECT') {
      const isMember =
        conversation.personAId === actor.personId ||
        conversation.personBId === actor.personId;
      if (!isMember) {
        throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
      }
      return { conversation, actorContext };
    }

    if (actorContext.role === 'PARENT') {
      if (conversation.parentPersonId !== actor.personId) {
        throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
      }
      const stillActive = await this.guardianLinkRepo.findActiveWardEnrolment(
        actor.personId,
        conversation.studentId as string,
        conversation.academicYearId as string,
        conversation.sectionId as string,
      );
      if (!stillActive) {
        throw new NotFoundException(MESSAGING_ERRORS.CONVERSATION_NOT_FOUND);
      }
    } else if (actorContext.role === 'PRINCIPAL') {
      // Principal's authorization is blanket, not scoped to a section/subject --
      // reaching this point (conversation exists, is STUDENT_CONTEXT) is enough.
      // No live re-check needed since nothing about "is this person a Principal"
      // can partially lapse the way a teaching assignment can (resolveActorContext
      // already re-verified ACTIVE staff status for this exact request).
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
  // has already happened by the time this is called). Only ever called for
  // STUDENT_CONTEXT conversations (every call site branches STAFF_DIRECT away
  // first), so section/year/parent are safely non-null here despite the nullable
  // type on ConversationView.
  private async syncParticipants(
    conversation: ConversationView,
    facultyCache?: Map<
      string,
      { personId: string; name: string; role: ParticipantRole }[]
    >,
  ): Promise<void> {
    const faculty = await this.deriveAuthorizedFaculty(
      conversation.sectionId as string,
      conversation.academicYearId as string,
      facultyCache,
    );
    await this.participantRepo.sync(conversation.id, [
      {
        personId: conversation.parentPersonId as string,
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

    let studentContext: ConversationView[];
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
      studentContext = await this.conversationRepo.listForParent(
        actor.personId,
      );
    } else if (actorContext.role === 'PRINCIPAL') {
      // No auto-created roster for Principal (unlike Parent/Faculty) -- there's
      // no bounded "their own students" set to seed one from. Their list is
      // exactly the STUDENT_CONTEXT conversations they've explicitly started.
      studentContext =
        await this.conversationRepo.listStudentContextForPrincipal(
          actor.personId,
        );
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
      studentContext =
        await this.conversationRepo.listBySectionYearPairs(sections);
    }

    // STAFF_DIRECT threads merge into the same unified inbox for both FACULTY and
    // PRINCIPAL (a Parent has no direct-messaging capability added by this
    // feature, so they never have any). One list, sorted by last activity --
    // not two separate inboxes to check.
    const staffDirect =
      actorContext.role === 'PARENT'
        ? []
        : await this.conversationRepo.listStaffDirectForPerson(actor.personId);

    const merged = [...studentContext, ...staffDirect].sort((a, b) => {
      const aTime = a.lastMessageAt?.getTime() ?? a.createdAt.getTime();
      const bTime = b.lastMessageAt?.getTime() ?? b.createdAt.getTime();
      return bTime - aTime;
    });

    return this.buildSummariesBulk(merged, actor.personId);
  }

  /** Splits a mixed list by conversationType and builds each half with its own
   * dedicated (and very differently-shaped) bulk builder, then re-merges in the
   * original (already time-sorted) order. The STUDENT_CONTEXT half below is
   * otherwise byte-for-byte the same batching logic this file always had. */
  private async buildSummariesBulk(
    conversations: ConversationView[],
    viewerPersonId: string,
  ): Promise<ConversationSummaryDto[]> {
    if (conversations.length === 0) return [];

    const studentContext = conversations.filter(
      (c) => c.conversationType === 'STUDENT_CONTEXT',
    ) as StudentContextConversation[];
    const staffDirect = conversations.filter(
      (c) => c.conversationType === 'STAFF_DIRECT',
    );

    const [studentSummaries, staffDirectSummaries] = await Promise.all([
      this.buildStudentContextSummariesBulk(studentContext, viewerPersonId),
      this.buildStaffDirectSummariesBulk(staffDirect, viewerPersonId),
    ]);

    const byId = new Map(
      [...studentSummaries, ...staffDirectSummaries].map((s) => [s.id, s]),
    );
    return conversations.map((c) => byId.get(c.id)!);
  }

  /** The STUDENT_CONTEXT list-summary path -- deliberately NOT one
   * syncParticipants()/toSummaryDto() call per conversation (see those methods'
   * own docs): a faculty's list can now span hundreds of conversations (every
   * student in every section they teach, per the Faculty auto-creation above),
   * and the per-conversation path was measured to time out well before that.
   * Every per-conversation cost here is batched into a small, fixed number of
   * queries regardless of how many conversations there are. Single-conversation
   * call sites (getConversation, sendMessage, etc.) keep using
   * syncParticipants()/toSummaryDto() directly -- there's exactly one
   * conversation there, so batching would only add complexity for no benefit. */
  private async buildStudentContextSummariesBulk(
    conversations: StudentContextConversation[],
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
    const [teachersBySectionYear, advisorsBySection, principalsByConversation] =
      await Promise.all([
        this.subjectOfferingRepo.findActiveTeachersForSections(pairs),
        this.classAdvisorRepo.findActiveAdvisorsForSections(
          pairs.map((p) => p.sectionId),
        ),
        this.participantRepo.findByRoleForConversations(
          conversations.map((c) => c.id),
          'PRINCIPAL',
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
      const principals = (principalsByConversation.get(c.id) ?? []).map(
        (p) => ({
          personId: p.personId,
          name: displayNameOf(p),
          role: 'PRINCIPAL' as ParticipantRole,
        }),
      );
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
        ...principals,
      ];
      const participants = allMembers.filter(
        (m) => m.personId !== viewerPersonId,
      );
      const lastMessage = c.lastMessageId
        ? (lastMessageById.get(c.lastMessageId) ?? null)
        : null;

      return {
        id: c.id,
        conversationType: 'STUDENT_CONTEXT',
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

  /** The STAFF_DIRECT list-summary path -- always exactly one "other party" per
   * conversation (no class-derivation at all), so this is a much smaller batch
   * than the STUDENT_CONTEXT builder above. */
  private async buildStaffDirectSummariesBulk(
    conversations: ConversationView[],
    viewerPersonId: string,
  ): Promise<ConversationSummaryDto[]> {
    if (conversations.length === 0) return [];

    const otherPersonIds = conversations.map((c) =>
      c.personAId === viewerPersonId
        ? (c.personBId as string)
        : (c.personAId as string),
    );
    const conversationIds = conversations.map((c) => c.id);
    const lastMessageIds = [
      ...new Set(
        conversations
          .map((c) => c.lastMessageId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [otherNames, otherIsPrincipal, ownReadByConversation, lastMessages] =
      await Promise.all([
        this.personRepo.findDisplayNames(otherPersonIds),
        this.principalRepo.filterActivePrincipals(otherPersonIds),
        this.participantRepo.findManyOwn(conversationIds, viewerPersonId),
        this.messageRepo.findByIds(lastMessageIds),
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
      const otherPersonId =
        c.personAId === viewerPersonId
          ? (c.personBId as string)
          : (c.personAId as string);
      const isPrincipal = otherIsPrincipal.has(otherPersonId);
      const role: ParticipantRole = isPrincipal
        ? 'PRINCIPAL'
        : 'FACULTY_DIRECT';
      const otherPerson = otherNames.get(otherPersonId);
      const name = otherPerson
        ? displayNameOf(otherPerson)
        : isPrincipal
          ? 'Principal'
          : 'Faculty';
      const directParticipant = { personId: otherPersonId, name, role };
      const lastMessage = c.lastMessageId
        ? (lastMessageById.get(c.lastMessageId) ?? null)
        : null;

      return {
        id: c.id,
        conversationType: 'STAFF_DIRECT',
        directParticipant,
        participants: [directParticipant],
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
    const summary =
      conversation.conversationType === 'STAFF_DIRECT'
        ? (
            await this.buildStaffDirectSummariesBulk(
              [conversation],
              actor.personId,
            )
          )[0]!
        : await this.toSummaryDto(
            conversation as StudentContextConversation,
            actor.personId,
          );
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
    conversation: StudentContextConversation,
    viewerPersonId: string,
    facultyCache?: Map<
      string,
      { personId: string; name: string; role: ParticipantRole }[]
    >,
  ): Promise<ConversationSummaryDto> {
    const [faculty, principalsByConversation] = await Promise.all([
      this.deriveAuthorizedFaculty(
        conversation.sectionId,
        conversation.academicYearId,
        facultyCache,
      ),
      this.participantRepo.findByRoleForConversations(
        [conversation.id],
        'PRINCIPAL',
      ),
    ]);
    const principals = (
      principalsByConversation.get(conversation.id) ?? []
    ).map((p) => ({
      personId: p.personId,
      name: displayNameOf(p),
      role: 'PRINCIPAL' as ParticipantRole,
    }));
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
      ...principals,
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
      conversationType: 'STUDENT_CONTEXT',
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
    conversation: StudentContextConversation,
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

    if (conversation.conversationType === 'STAFF_DIRECT') {
      return this.listMessagesForStaffDirect(
        actor,
        conversation,
        limit,
        before,
      );
    }
    const sc = conversation as StudentContextConversation;

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
      (await this.participantRepo.findOne(conversationId, sc.parentPersonId))
        ?.lastReadAt ?? null;
    const faculty = await this.deriveAuthorizedFaculty(
      sc.sectionId,
      sc.academicYearId,
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
          sc,
          message.senderPersonId,
          faculty,
        );
        const senderName = await this.nameOf(
          sc,
          message.senderPersonId,
          faculty,
        );

        let readAt: Date | null = null;
        if (message.senderPersonId === actor.personId) {
          if (actor.personId === sc.parentPersonId) {
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

  /** STAFF_DIRECT message history -- always exactly two fixed parties, so
   * role/name resolution is a one-shot lookup per party rather than a whole
   * class-derived faculty list. */
  private async listMessagesForStaffDirect(
    actor: AuthenticatedUser,
    conversation: ConversationView,
    limit: number | undefined,
    before: string | undefined,
  ): Promise<{
    items: MessageDto[];
    meta: { hasMore: boolean; nextCursor: string | null };
  }> {
    const personAId = conversation.personAId as string;
    const personBId = conversation.personBId as string;
    const otherPersonId = personAId === actor.personId ? personBId : personAId;

    const page = await this.messageRepo.listPage(
      conversation.id,
      limit ?? MESSAGE_PAGE_DEFAULT_LIMIT,
      before,
    );
    const chronological = [...page.items].reverse();

    const [
      selfPerson,
      otherPerson,
      selfIsPrincipal,
      otherIsPrincipal,
      otherRead,
    ] = await Promise.all([
      this.personRepo.findDisplayName(actor.personId),
      this.personRepo.findDisplayName(otherPersonId),
      this.principalRepo.isActivePrincipal(actor.personId),
      this.principalRepo.isActivePrincipal(otherPersonId),
      this.participantRepo.findOne(conversation.id, otherPersonId),
    ]);

    const nameFor = (personId: string): string => {
      if (personId === actor.personId) {
        return selfPerson ? displayNameOf(selfPerson) : 'You';
      }
      if (otherPerson) return displayNameOf(otherPerson);
      return otherIsPrincipal ? 'Principal' : 'Faculty';
    };
    const roleFor = (personId: string): ParticipantRole =>
      (personId === actor.personId ? selfIsPrincipal : otherIsPrincipal)
        ? 'PRINCIPAL'
        : 'FACULTY_DIRECT';

    const items = chronological.map((message) => {
      const readAt =
        message.senderPersonId === actor.personId &&
        otherRead?.lastReadAt &&
        otherRead.lastReadAt >= message.createdAt
          ? otherRead.lastReadAt
          : null;
      return {
        id: message.id,
        conversationId: message.conversationId,
        sender: {
          personId: message.senderPersonId,
          name: nameFor(message.senderPersonId),
          role: roleFor(message.senderPersonId),
        },
        text: message.messageText,
        createdAt: message.createdAt.toISOString(),
        readAt: readAt?.toISOString() ?? null,
        status: 'SENT' as const,
      };
    });

    return {
      items,
      meta: {
        hasMore: page.hasMore,
        nextCursor: page.hasMore ? chronological[0]!.id : null,
      },
    };
  }

  private async roleOf(
    conversation: StudentContextConversation,
    personId: string,
    faculty: { personId: string; role: ParticipantRole }[],
  ): Promise<ParticipantRole> {
    if (personId === conversation.parentPersonId) return 'PARENT';
    const known = faculty.find((f) => f.personId === personId)?.role;
    if (known) return known;
    // Closes a real gap the fallback below used to have: an unrecognized sender
    // (not the parent, not a currently-derived subject teacher/class advisor)
    // used to silently default to SUBJECT_TEACHER -- which would have mislabeled
    // a Principal's own message. Checked last since it's the rarer case.
    if (await this.principalRepo.isActivePrincipal(personId)) {
      return 'PRINCIPAL';
    }
    return 'SUBJECT_TEACHER';
  }

  private async nameOf(
    conversation: StudentContextConversation,
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

    if (conversation.conversationType === 'STAFF_DIRECT') {
      return this.sendMessageForStaffDirect(
        actor,
        conversation,
        trimmed,
        idempotencyKey,
      );
    }
    const sc = conversation as StudentContextConversation;

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
        : actorContext.role === 'PRINCIPAL'
          ? 'PRINCIPAL'
          : await this.roleForFaculty(sc, actor.personId);
    if (actorContext.role === 'PRINCIPAL') {
      // Makes the Principal's engagement with this thread durable (drives both
      // listStudentContextForPrincipal and the participants-array inclusion
      // above) -- defensive here even though startStudentConversations already
      // does this up front, in case a Principal ever reaches a conversation id
      // without having gone through that flow first. Idempotent upsert, never a
      // duplicate row.
      await this.participantRepo.sync(conversationId, [
        { personId: actor.personId, role: 'PRINCIPAL' },
      ]);
    }
    const senderName = await this.nameOf(
      sc,
      actor.personId,
      await this.deriveAuthorizedFaculty(sc.sectionId, sc.academicYearId),
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

  /** STAFF_DIRECT send -- identical idempotency/immutability contract as the
   * STUDENT_CONTEXT path above (same message table, same insert method), just
   * without any class-derived role to resolve. */
  private async sendMessageForStaffDirect(
    actor: AuthenticatedUser,
    conversation: ConversationView,
    trimmed: string,
    idempotencyKey: string,
  ): Promise<MessageDto> {
    const message = await this.unitOfWork.run(async (client) => {
      const existing = await this.messageRepo.findByIdempotencyKey(
        conversation.id,
        actor.personId,
        idempotencyKey,
        client,
      );
      if (existing) return existing;

      const inserted = await this.messageRepo.insert(
        conversation.id,
        actor.personId,
        trimmed,
        idempotencyKey,
        client,
      );
      await this.conversationRepo.updateLastMessage(
        conversation.id,
        inserted.id,
        inserted.createdAt,
        client,
      );
      return inserted;
    });

    const isPrincipal = await this.principalRepo.isActivePrincipal(
      actor.personId,
    );
    const role: ParticipantRole = isPrincipal ? 'PRINCIPAL' : 'FACULTY_DIRECT';
    const senderPerson = await this.personRepo.findDisplayName(actor.personId);
    const senderName = senderPerson
      ? displayNameOf(senderPerson)
      : isPrincipal
        ? 'Principal'
        : 'Faculty';

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: isPrincipal ? 'PRINCIPAL' : 'FACULTY',
      action: 'STAFF_DIRECT_MESSAGE_SENT',
      objectType: 'conversation',
      objectId: conversation.id,
      outcome: 'SUCCESS',
    });

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
    conversation: StudentContextConversation,
    personId: string,
  ): Promise<ParticipantRole> {
    const faculty = await this.deriveAuthorizedFaculty(
      conversation.sectionId,
      conversation.academicYearId,
    );
    const known = faculty.find((f) => f.personId === personId)?.role;
    if (known) return known;
    if (await this.principalRepo.isActivePrincipal(personId)) {
      return 'PRINCIPAL';
    }
    return 'SUBJECT_TEACHER';
  }

  // ---- Read state ------------------------------------------------------------------

  async markRead(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<void> {
    const { conversation, actorContext } =
      await this.getAuthorizedConversationOrThrow(actor, conversationId);

    if (conversation.conversationType === 'STAFF_DIRECT') {
      const isPrincipal = await this.principalRepo.isActivePrincipal(
        actor.personId,
      );
      await this.participantRepo.markRead(
        conversationId,
        actor.personId,
        isPrincipal ? 'PRINCIPAL' : 'FACULTY_DIRECT',
        new Date(),
      );
      return;
    }

    const role: ParticipantRole =
      actorContext.role === 'PARENT'
        ? 'PARENT'
        : actorContext.role === 'PRINCIPAL'
          ? 'PRINCIPAL'
          : await this.roleForFaculty(
              conversation as StudentContextConversation,
              actor.personId,
            );
    await this.participantRepo.markRead(
      conversationId,
      actor.personId,
      role,
      new Date(),
    );
  }

  // ---- Translation -------------------------------------------------------------
  // Deliberately no conversationType branching -- translation only ever needs a
  // message's id/text, identical for either conversation shape. Authorization is
  // already fully handled by getAuthorizedConversationOrThrow above.

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

  // ---- Principal: start a new conversation -----------------------------------------

  /** Fans out to EVERY currently ACTIVE guardian at once (confirmed product
   * decision -- never silently picks just one when a student has more than one).
   * Reuses the exact same findOrCreate the Parent/Faculty flows already use, so
   * a Principal-created conversation is indistinguishable in shape from one a
   * parent or faculty member created -- the guardian sees it in their own
   * existing Messages list with no special-casing needed on their side. */
  async startStudentConversations(
    actor: AuthenticatedUser,
    studentId: string,
  ): Promise<ConversationSummaryDto[]> {
    const actorContext = await this.resolveActorContext(actor);
    if (actorContext.role !== 'PRINCIPAL') {
      throw new ForbiddenException(MESSAGING_ERRORS.NOT_ACTIVE_PRINCIPAL);
    }

    const context =
      await this.guardianLinkRepo.findActiveContextForStudent(studentId);
    if (!context) {
      throw new NotFoundException(MESSAGING_ERRORS.STUDENT_NOT_FOUND);
    }
    if (context.guardians.length === 0) {
      throw new BadRequestException(MESSAGING_ERRORS.NO_ACTIVE_GUARDIAN);
    }

    const conversations: ConversationView[] = [];
    for (const guardian of context.guardians) {
      const conversation = await this.conversationRepo.findOrCreate(
        context.studentId,
        guardian.personId,
        context.academicYearId,
        context.sectionId,
      );
      await this.participantRepo.sync(conversation.id, [
        { personId: actor.personId, role: 'PRINCIPAL' },
      ]);
      conversations.push(conversation);
    }

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'PRINCIPAL',
      action: 'STUDENT_CONTEXT_CONVERSATION_STARTED',
      objectType: 'student',
      objectId: studentId,
      outcome: 'SUCCESS',
      afterData: { guardianCount: context.guardians.length },
    });

    return this.buildStudentContextSummariesBulk(
      conversations as StudentContextConversation[],
      actor.personId,
    );
  }

  /** Verifies the target currently holds an ACTIVE FACULTY role_assignment --
   * never trusts the client's claim that a picked person is really a faculty
   * member -- then find-or-creates the one STAFF_DIRECT thread for this pair. */
  async startStaffDirectConversation(
    actor: AuthenticatedUser,
    facultyPersonId: string,
  ): Promise<ConversationSummaryDto> {
    const actorContext = await this.resolveActorContext(actor);
    if (actorContext.role !== 'PRINCIPAL') {
      throw new ForbiddenException(MESSAGING_ERRORS.NOT_ACTIVE_PRINCIPAL);
    }

    const isFaculty = await this.principalRepo.isActiveFaculty(facultyPersonId);
    if (!isFaculty) {
      await this.auditService.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'PRINCIPAL',
        action: 'STAFF_DIRECT_CONVERSATION_DENIED',
        objectType: 'person',
        objectId: facultyPersonId,
        outcome: 'DENIED',
        afterData: { reason: MESSAGING_ERRORS.TARGET_NOT_ACTIVE_FACULTY },
      });
      throw new BadRequestException(MESSAGING_ERRORS.TARGET_NOT_ACTIVE_FACULTY);
    }

    const conversation = await this.conversationRepo.findOrCreateStaffDirect(
      actor.personId,
      facultyPersonId,
    );

    await this.auditService.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'PRINCIPAL',
      action: 'STAFF_DIRECT_CONVERSATION_STARTED',
      objectType: 'conversation',
      objectId: conversation.id,
      outcome: 'SUCCESS',
    });

    const [summary] = await this.buildStaffDirectSummariesBulk(
      [conversation],
      actor.personId,
    );
    return summary!;
  }
}

// A STUDENT_CONTEXT conversation's class-scoping fields, non-null -- true at the
// DB level (enforced by the CHECK constraint added alongside conversation_type,
// see query.md) for every row this narrowing is ever applied to (every call site
// filters/branches STAFF_DIRECT away first). Avoids repeating `as string` at
// every single field access across the methods above.
type StudentContextConversation = ConversationView & {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  parentPersonId: string;
  academicYearId: string;
  academicYearName: string;
  sectionId: string;
  sectionName: string;
  gradeName: string;
};

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
