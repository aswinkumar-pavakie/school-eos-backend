// The conversation row itself, plus the joined display fields the API responses
// need (student/section/grade/academic-year names). Authorization is never decided
// here — every access still goes through GuardianLinkRepository/
// SubjectOfferingRepository/ClassAdvisorRepository live, even for a conversation
// found by id.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type ConversationStatus = 'ACTIVE' | 'CLOSED';
export type ConversationType = 'STUDENT_CONTEXT' | 'STAFF_DIRECT';

// A conversation is polymorphic: every row created before this type existed (and
// every row `findOrCreate`/`ensureExist` create today) is a 'STUDENT_CONTEXT' row
// -- the class/student-scoped shape this module was originally built around, with
// student/academicYear/section always populated. A 'STAFF_DIRECT' row (a
// Principal <-> Faculty direct thread, no student/class context at all) is the
// opposite: those three are always null, and personAId/personBId (always null on
// a 'STUDENT_CONTEXT' row) hold the two participants instead, order-normalized
// (personAId < personBId) so one unordered pair never gets two rows. See
// query.md's migration for the DB-level CHECK enforcing this split and the
// partial unique index enforcing one row per staff pair.
export interface ConversationView {
  id: string;
  conversationType: ConversationType;
  studentId: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  parentPersonId: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  gradeName: string | null;
  personAId: string | null;
  personBId: string | null;
  status: ConversationStatus;
  lastMessageId: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// LEFT JOINs (not INNER) so a 'STAFF_DIRECT' row -- student_id/academic_year_id/
// section_id all null -- still comes back as a row instead of vanishing. For
// every existing 'STUDENT_CONTEXT' row those columns are always populated, so
// this changes nothing about their results (an INNER JOIN and a LEFT JOIN return
// identical rows whenever the joined-to row exists).
const DETAIL_SELECT = `
  SELECT c.id, c.conversation_type, c.student_id, p.first_name AS student_first_name, p.last_name AS student_last_name,
         c.parent_person_id, c.academic_year_id, ay.name AS academic_year_name,
         c.section_id, sec.name AS section_name, g.name AS grade_name,
         c.person_a_id, c.person_b_id,
         c.status, c.last_message_id, c.last_message_at, c.created_at, c.updated_at
  FROM conversation c
  LEFT JOIN student st ON st.id = c.student_id
  LEFT JOIN person p ON p.id = st.person_id
  LEFT JOIN academic_year ay ON ay.id = c.academic_year_id
  LEFT JOIN section sec ON sec.id = c.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id
`;

interface DetailRow {
  id: string;
  conversation_type: ConversationType;
  student_id: string | null;
  student_first_name: string | null;
  student_last_name: string | null;
  parent_person_id: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  section_id: string | null;
  section_name: string | null;
  grade_name: string | null;
  person_a_id: string | null;
  person_b_id: string | null;
  status: ConversationStatus;
  last_message_id: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: DetailRow): ConversationView {
  return {
    id: row.id,
    conversationType: row.conversation_type,
    studentId: row.student_id,
    studentFirstName: row.student_first_name,
    studentLastName: row.student_last_name,
    parentPersonId: row.parent_person_id,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name,
    sectionId: row.section_id,
    sectionName: row.section_name,
    gradeName: row.grade_name,
    personAId: row.person_a_id,
    personBId: row.person_b_id,
    status: row.status,
    lastMessageId: row.last_message_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class ConversationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<ConversationView | null> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT} WHERE c.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Every conversation belonging to this parent (across all their wards) —
   * ordering by last activity matches the WhatsApp-style list requirement. Callers
   * must have already find-or-created a row per currently-active ward before
   * calling this, so it reflects exactly the parent's current authorized set. */
  async listForParent(
    parentPersonId: string,
    executor: Queryable = this.postgres,
  ): Promise<ConversationView[]> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT} WHERE c.parent_person_id = $1 ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [parentPersonId],
    );
    return rows.map(mapRow);
  }

  /** Every existing conversation whose (section, academic_year) is in the given
   * set — the faculty-side list. Conversations are parent-initiated (see
   * MessagingService); this never creates one. */
  async listBySectionYearPairs(
    pairs: { sectionId: string; academicYearId: string }[],
    executor: Queryable = this.postgres,
  ): Promise<ConversationView[]> {
    if (pairs.length === 0) return [];
    const sectionIds = pairs.map((p) => p.sectionId);
    const yearIds = pairs.map((p) => p.academicYearId);
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       JOIN unnest($1::uuid[], $2::uuid[]) AS authorized(section_id, academic_year_id)
         ON authorized.section_id = c.section_id AND authorized.academic_year_id = c.academic_year_id
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [sectionIds, yearIds],
    );
    return rows.map(mapRow);
  }

  /** Idempotent find-or-create for the (student, parent, year, section) context —
   * concurrency-safe via the unique index (uq_conversation_context), never a
   * duplicate under concurrent requests. */
  async findOrCreate(
    studentId: string,
    parentPersonId: string,
    academicYearId: string,
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<ConversationView> {
    const inserted = await executor.query<{ id: string }>(
      `INSERT INTO conversation (student_id, parent_person_id, academic_year_id, section_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, parent_person_id, academic_year_id, section_id) DO NOTHING
       RETURNING id`,
      [studentId, parentPersonId, academicYearId, sectionId],
    );

    const id = inserted.rows.length
      ? inserted.rows[0].id
      : (
          await executor.query<{ id: string }>(
            `SELECT id FROM conversation
             WHERE student_id = $1 AND parent_person_id = $2 AND academic_year_id = $3 AND section_id = $4`,
            [studentId, parentPersonId, academicYearId, sectionId],
          )
        ).rows[0].id;

    const view = await this.findById(id, executor);
    if (!view) {
      throw new Error(
        'Conversation vanished immediately after find-or-create — should never happen.',
      );
    }
    return view;
  }

  /** Bulk find-or-create -- the Faculty-side equivalent of findOrCreate, done in
   * one round trip instead of one per (student, guardian) pair. A class of 30
   * students with 2 guardians each is 60 rows in a single INSERT, not 60 separate
   * queries. Existing rows are untouched (DO NOTHING); the caller re-lists
   * afterward to get the full, current set. */
  async ensureExist(
    pairs: {
      studentId: string;
      parentPersonId: string;
      academicYearId: string;
      sectionId: string;
    }[],
    executor: Queryable = this.postgres,
  ): Promise<void> {
    if (pairs.length === 0) return;
    const values = pairs
      .map(
        (_, i) =>
          `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
      )
      .join(', ');
    const params = pairs.flatMap((p) => [
      p.studentId,
      p.parentPersonId,
      p.academicYearId,
      p.sectionId,
    ]);
    await executor.query(
      `INSERT INTO conversation (student_id, parent_person_id, academic_year_id, section_id)
       VALUES ${values}
       ON CONFLICT (student_id, parent_person_id, academic_year_id, section_id) DO NOTHING`,
      params,
    );
  }

  async updateLastMessage(
    id: string,
    messageId: string,
    lastMessageAt: Date,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE conversation SET last_message_id = $2, last_message_at = $3, updated_at = now() WHERE id = $1`,
      [id, messageId, lastMessageAt],
    );
  }

  /** Every STUDENT_CONTEXT conversation a Principal has started/engaged with --
   * unlike Parent/Faculty, a Principal gets no auto-created roster (there's no
   * bounded "their own students" set to seed one from), so their list is exactly
   * the conversations carrying a 'PRINCIPAL' conversation_participant row (written
   * by MessagingService.startStudentConversations / sendMessage), never every
   * conversation in the school. */
  async listStudentContextForPrincipal(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<ConversationView[]> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       JOIN conversation_participant cp ON cp.conversation_id = c.id
         AND cp.person_id = $1 AND cp.participant_role = 'PRINCIPAL'
       WHERE c.conversation_type = 'STUDENT_CONTEXT'
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [personId],
    );
    return rows.map(mapRow);
  }

  // ---- STAFF_DIRECT (Principal <-> Faculty, no student/class context) ----------

  /** Idempotent find-or-create for one unordered pair of people -- mirrors
   * findOrCreate()'s exact concurrency-safe shape, just keyed on the new partial
   * unique index (one row per unordered pair, WHERE conversation_type =
   * 'STAFF_DIRECT') instead of the student-scoped one. Always normalizes so
   * person_a_id < person_b_id, so "A messages B" and "B messages A" resolve to the
   * identical row regardless of call order. */
  async findOrCreateStaffDirect(
    personIdOne: string,
    personIdTwo: string,
    executor: Queryable = this.postgres,
  ): Promise<ConversationView> {
    const [personA, personB] =
      personIdOne < personIdTwo
        ? [personIdOne, personIdTwo]
        : [personIdTwo, personIdOne];

    const inserted = await executor.query<{ id: string }>(
      `INSERT INTO conversation (conversation_type, person_a_id, person_b_id)
       VALUES ('STAFF_DIRECT', $1, $2)
       ON CONFLICT (person_a_id, person_b_id) WHERE conversation_type = 'STAFF_DIRECT'
       DO NOTHING
       RETURNING id`,
      [personA, personB],
    );

    const id = inserted.rows.length
      ? inserted.rows[0].id
      : (
          await executor.query<{ id: string }>(
            `SELECT id FROM conversation
             WHERE conversation_type = 'STAFF_DIRECT' AND person_a_id = $1 AND person_b_id = $2`,
            [personA, personB],
          )
        ).rows[0].id;

    const view = await this.findById(id, executor);
    if (!view) {
      throw new Error(
        'Staff-direct conversation vanished immediately after find-or-create — should never happen.',
      );
    }
    return view;
  }

  /** Every STAFF_DIRECT conversation this person is one of the two parties in,
   * newest-activity first -- the direct-thread half of a unified inbox (merged
   * with listForParent/listBySectionYearPairs's STUDENT_CONTEXT-type results in
   * MessagingService.listConversations). */
  async listStaffDirectForPerson(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<ConversationView[]> {
    const { rows } = await executor.query<DetailRow>(
      `${DETAIL_SELECT}
       WHERE c.conversation_type = 'STAFF_DIRECT' AND (c.person_a_id = $1 OR c.person_b_id = $1)
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [personId],
    );
    return rows.map(mapRow);
  }
}
