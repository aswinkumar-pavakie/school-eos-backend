// Locks down exactly which @Roles() a caller needs to reach each route — this is what
// RolesGuard actually reads (see common/auth/roles.guard.ts, common/auth/
// roles.decorator.ts). A real HTTP call would need a live server; reading the metadata
// directly is a fast, precise way to guarantee no write endpoint has silently gained
// PARENT access (or lost FACULTY), and that read endpoints accept both.

import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { OnlineClassesController } from './online-classes.controller';

function rolesFor(
  methodName: keyof OnlineClassesController,
): string[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    OnlineClassesController.prototype[methodName],
  );
}

describe('OnlineClassesController — route roles', () => {
  it('list and detail accept both FACULTY and PARENT', () => {
    expect(rolesFor('list')).toEqual(['FACULTY', 'PARENT']);
    expect(rolesFor('detail')).toEqual(['FACULTY', 'PARENT']);
  });

  it('requestCallToken accepts both FACULTY (Start/Resume) and PARENT (Join) — Nest can only register one handler per path+method, so this single handler must branch on role internally, same as list/detail', () => {
    expect(rolesFor('requestCallToken')).toEqual(['FACULTY', 'PARENT']);
  });

  it('endCall and muteParticipant remain FACULTY-only', () => {
    expect(rolesFor('endCall')).toEqual(['FACULTY']);
    expect(rolesFor('muteParticipant')).toEqual(['FACULTY']);
  });

  it('myTeachingOfferings is FACULTY-only — PARENT must never reach it', () => {
    expect(rolesFor('myTeachingOfferings')).toEqual(['FACULTY']);
  });

  it('every write operation remains FACULTY-only — PARENT must never reach these', () => {
    expect(rolesFor('schedule')).toEqual(['FACULTY']);
    expect(rolesFor('reschedule')).toEqual(['FACULTY']);
    expect(rolesFor('cancel')).toEqual(['FACULTY']);
    expect(rolesFor('start')).toEqual(['FACULTY']);
    expect(rolesFor('complete')).toEqual(['FACULTY']);
    expect(rolesFor('addRecording')).toEqual(['FACULTY']);
  });
});
