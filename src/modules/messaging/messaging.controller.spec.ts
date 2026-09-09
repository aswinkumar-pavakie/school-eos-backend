// Locks down exactly which @Roles() a caller needs to reach each route — same
// approach as online-classes.controller.spec.ts. Every messaging route accepts both
// FACULTY and PARENT; the actual per-conversation authorization is decided inside
// MessagingService, not by role alone (see messaging.service.spec.ts).

import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { MessagingController } from './messaging.controller';

function rolesFor(methodName: keyof MessagingController): string[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, MessagingController.prototype[methodName]);
}

describe('MessagingController — route roles', () => {
  it('every route accepts both FACULTY and PARENT', () => {
    expect(rolesFor('listConversations')).toEqual(['FACULTY', 'PARENT']);
    expect(rolesFor('getConversation')).toEqual(['FACULTY', 'PARENT']);
    expect(rolesFor('listMessages')).toEqual(['FACULTY', 'PARENT']);
    expect(rolesFor('sendMessage')).toEqual(['FACULTY', 'PARENT']);
    expect(rolesFor('markRead')).toEqual(['FACULTY', 'PARENT']);
    expect(rolesFor('translateMessage')).toEqual(['FACULTY', 'PARENT']);
  });

  it('9. no other role (e.g. HOSTEL_WARDEN) is listed — RolesGuard rejects them before the handler runs', () => {
    for (const method of ['listConversations', 'getConversation', 'listMessages', 'sendMessage', 'markRead', 'translateMessage'] as const) {
      expect(rolesFor(method)).not.toContain('HOSTEL_WARDEN');
      expect(rolesFor(method)).not.toContain('ADMIN');
    }
  });
});
