// @Public() exempts a route from the global AuthGuard — used only on login, refresh,
// logout, and password-reset, which by definition run before a caller has a token.

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
