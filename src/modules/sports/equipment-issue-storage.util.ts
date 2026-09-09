// Equipment-issue signatures reuse the exact same Supabase Storage bucket and
// PNG validation as student-events' parent-consent signatures (see
// student-events/student-event-storage.util.ts) — same real-world artifact
// (a captured signature image), no reason to stand up a second private bucket
// or duplicate the magic-bytes check.

import { randomUUID } from 'crypto';

export function equipmentIssueSignatureObjectKeyFor(issueId: string): string {
  return `signatures/equipment-issue-${issueId}-${randomUUID()}.png`;
}
