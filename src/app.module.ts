import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './common/auth/auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import configuration from './config/configuration';
import { jwtModuleFactory } from './config/jwt.config';
import { validate } from './config/validation.schema';
import { PostgresModule } from './infrastructure/postgres/postgres.module';
import { IdentityModule } from './modules/identity/identity.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    // Registered here too (independently of IdentityModule's own registration) so
    // AuthGuard, provided as an APP_GUARD below, can inject JwtService from this
    // module's own scope.
    JwtModule.registerAsync(jwtModuleFactory),
    PostgresModule,
    IdentityModule,
  ],
  providers: [
    // Global guards, in order: AuthGuard resolves identity and sets request.user;
    // RolesGuard then checks it against @Roles(). Registered here — never attached
    // per-controller — so no new controller can ship without them.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
