// @Roles('ADMIN') declares which role_code(s) RolesGuard requires. Deliberately separate
// from @Public()/AuthGuard — identity ("who is this") and authorization ("what can they
// do") are different concerns and shouldn't be collapsed into one guard.

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
