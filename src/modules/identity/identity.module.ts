import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleFactory } from '../../config/jwt.config';
import { AdminIdentityController } from './admin-identity.controller';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { LoginIdentifierRepository } from './repositories/login-identifier.repository';
import { OtpChallengeRepository } from './repositories/otp-challenge.repository';
import { PersonRepository } from './repositories/person.repository';
import { RoleAssignmentRepository } from './repositories/role-assignment.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserCredentialRepository } from './repositories/user-credential.repository';

@Module({
  imports: [JwtModule.registerAsync(jwtModuleFactory)],
  controllers: [IdentityController, PasswordResetController, AdminIdentityController],
  providers: [
    IdentityService,
    PasswordResetService,
    LoginIdentifierRepository,
    UserCredentialRepository,
    PersonRepository,
    RoleAssignmentRepository,
    SessionRepository,
    OtpChallengeRepository,
  ],
})
export class IdentityModule {}
