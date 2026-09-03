// Shared JwtModule.registerAsync options — used both in AppModule (so the globally
// registered AuthGuard can inject JwtService) and IdentityModule (so IdentityService
// can sign tokens), keeping the secret/expiry sourced from ConfigService in one place.

import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';

export const jwtModuleFactory = {
  inject: [ConfigService],
  useFactory: (configService: ConfigService): JwtModuleOptions => ({
    secret: configService.get<string>('jwt.accessSecret'),
    signOptions: {
      // '15m'-style duration string from env; jsonwebtoken's type wants one of its
      // literal StringValue variants, which a runtime env string can't be narrowed to.
      expiresIn: configService.get<string>('jwt.accessExpiresIn') as JwtSignOptions['expiresIn'],
    },
  }),
};
