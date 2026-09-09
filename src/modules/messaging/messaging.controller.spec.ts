// Locks down exactly which @Roles() a caller needs to reach each route — same
// approach as online-classes.controller.spec.ts. Every shared conversation route
// accepts FACULTY, PARENT and PRINCIPAL; the actual per-conversation
// authorization is decided inside MessagingService, not by role alone (see
// messaging.service.spec.ts). The Principal-only start/search routes accept
// PRINCIPAL alone -- Faculty/Parent must never reach those, even though they
// can reach a conversation once a Principal has started one.

import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { MessagingController } from './messaging.controller';

function rolesFor(methodName: keyof MessagingController): string[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    MessagingController.prototype[methodName],
  );
}

const SHARED_CONVERSATION_ROUTES = [
  'listConversations',
  'getConversation',
  'listMessages',
  'sendMessage',
  'markRead',
  'translateMessage',
] as const;

const PRINCIPAL_ONLY_ROUTES = [
  'startFacultyConversation',
  'startStudentConversation',
  'searchFaculty',
  'searchStudents',
] as const;

const FACULTY_ONLY_ROUTES = ['startPrincipalConversation'] as const;

describe('MessagingController — route roles', () => {
  it('every shared conversation route accepts FACULTY, PARENT and PRINCIPAL', () => {
    for (const method of SHARED_CONVERSATION_ROUTES) {
      expect(rolesFor(method)).toEqual(['FACULTY', 'PARENT', 'PRINCIPAL']);
    }
  });

  it('9. no other role (e.g. HOSTEL_WARDEN) is listed — RolesGuard rejects them before the handler runs', () => {
    for (const method of SHARED_CONVERSATION_ROUTES) {
      expect(rolesFor(method)).not.toContain('HOSTEL_WARDEN');
      expect(rolesFor(method)).not.toContain('ADMIN');
    }
  });

  it('Principal-only routes (start a conversation, search directories) accept ONLY PRINCIPAL — never FACULTY or PARENT', () => {
    for (const method of PRINCIPAL_ONLY_ROUTES) {
      expect(rolesFor(method)).toEqual(['PRINCIPAL']);
    }
  });

  it('the Faculty-only route (start a conversation with the Principal) accepts ONLY FACULTY — never PARENT or PRINCIPAL', () => {
    for (const method of FACULTY_ONLY_ROUTES) {
      expect(rolesFor(method)).toEqual(['FACULTY']);
    }
  });
});
