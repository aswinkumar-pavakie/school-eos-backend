// Every domain object that plugs into the approvals engine (refund, concession,
// fee_structure, purchase_request, ...) needs its own "what does APPROVED/REJECTED/
// CANCELLED mean for my table" logic — that's genuinely domain-specific and does not
// belong in the generic engine. This registry is the seam: the owning feature module
// registers a handler for its subject_object_type; the engine calls it, inside the
// same transaction, once a request reaches a terminal decision or is withdrawn. A
// subject_object_type with no registered handler fails loudly rather than silently
// skipping the state flip.

import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../infrastructure/postgres/postgres.service';

export interface SubjectStateHandler {
  /** decidedBy: the approver's personId — passed through so a handler that creates a
   * downstream row (e.g. a purchase_order the moment a purchase_request is approved)
   * has a real actor for that row's own created_by/actor columns. */
  onApproved(subjectId: string, executor: Queryable, decidedBy: string): Promise<void>;
  onRejected(subjectId: string, executor: Queryable, decidedBy: string): Promise<void>;
  /** Called when the requester withdraws their own still-open request (approval_request -> CANCELLED). Optional — most subjects so far don't need a distinct reaction to a withdrawal versus a rejection. */
  onWithdrawn?(subjectId: string, executor: Queryable): Promise<void>;
  /** Called when an approver sends the request back for revision (approval_request
   * -> SENT_BACK). Optional and best-effort, same as onWithdrawn — unlike
   * onApproved/onRejected this is never required, since a send-back doesn't flip
   * the subject to a terminal state; most subjects need no reaction at all. */
  onSentBack?(subjectId: string, executor: Queryable): Promise<void>;
}

@Injectable()
export class SubjectStateRegistry {
  private readonly handlers = new Map<string, SubjectStateHandler>();

  register(subjectObjectType: string, handler: SubjectStateHandler): void {
    this.handlers.set(subjectObjectType, handler);
  }

  get(subjectObjectType: string): SubjectStateHandler | undefined {
    return this.handlers.get(subjectObjectType);
  }
}

/** A handler for the common case: a table with a plain `state` column taking APPROVED/REJECTED. */
export function simpleStateColumnHandler(table: string): SubjectStateHandler {
  return {
    async onApproved(subjectId, executor, _decidedBy) {
      await executor.query(`UPDATE ${table} SET state = 'APPROVED' WHERE id = $1`, [subjectId]);
    },
    async onRejected(subjectId, executor, _decidedBy) {
      await executor.query(`UPDATE ${table} SET state = 'REJECTED' WHERE id = $1`, [subjectId]);
    },
  };
}
