// Internal-only endpoints for the separate school-eos-messaging service (LLD
// §79/§32 of the two approved specs) — never mounted under the versioned
// public /api/v1/* prefix, never reachable by any mobile/web client. Guarded
// by InternalServiceGuard's shared-secret check, and @Public() to bypass the
// user-JWT AuthGuard entirely (there is no end-user session on a
// service-to-service call — see InternalServiceGuard's own header comment for
// why @Public() alone doesn't leave this open).
//
// Every response here is read-only, minimal-field, and reflects LIVE current
// state — Messaging fails closed if this integration is unreachable or
// returns something unexpected (its own documented decision), never falls
// back to a permissive default.

import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';
import { PersonDeviceTokenRepository } from '../notifications/repositories/person-device-token.repository';
import {
  DEFAULT_LIST_LIMIT,
  ListMessagingUsersQueryDto,
} from './dto/list-messaging-users.query.dto';
import { InternalServiceGuard } from './internal-service.guard';
import { MessagingIntegrationService } from './messaging-integration.service';
import { MessagingUserRepository } from './repositories/messaging-user.repository';

@Public()
@UseGuards(InternalServiceGuard)
@Controller('internal/v1/messaging')
export class MessagingIntegrationController {
  constructor(
    private readonly service: MessagingIntegrationService,
    private readonly userRepo: MessagingUserRepository,
    private readonly deviceTokenRepo: PersonDeviceTokenRepository,
  ) {}

  @Get('relationships/parent/:personId')
  async parentRelationships(@Param('personId', ParseUUIDPipe) personId: string) {
    return { relatedPersonIds: await this.service.getParentRelationships(personId) };
  }

  @Get('relationships/faculty/:personId')
  async facultyRelationships(@Param('personId', ParseUUIDPipe) personId: string) {
    return { relatedPersonIds: await this.service.getFacultyRelationships(personId) };
  }

  @Get('relationships/warden/:personId')
  async wardenRelationships(@Param('personId', ParseUUIDPipe) personId: string) {
    return { relatedPersonIds: await this.service.getWardenRelationships(personId) };
  }

  @Get('users/:personId')
  async userProjection(@Param('personId', ParseUUIDPipe) personId: string) {
    const projection = await this.userRepo.getProjection(personId);
    // A genuinely-missing person is reported plainly here — this is a trusted
    // internal caller, not the anti-enumeration boundary (LLD §53) that
    // applies to Messaging's own client-facing directory/search endpoints.
    return { data: projection };
  }

  @Get('users')
  async listMessagingUsers(@Query() query: ListMessagingUsersQueryDto) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const items = await this.userRepo.listMessagingEnabled({
      cursor: query.cursor,
      limit,
      excludePersonId: query.excludePersonId,
    });
    const nextCursor = items.length === limit ? items[items.length - 1].personId : null;
    return { data: items, nextCursor };
  }

  /** Real Expo push tokens already registered for this person via the
   * existing POST /notifications/device-token route (every mobile login
   * already registers one — see school-eos-mobile's useRegisterPushToken).
   * Messaging's own outbox worker calls this to actually deliver a
   * "you have a new message" push -- it never stores or owns device tokens
   * itself, since that would duplicate state Core already owns and keeps
   * current on every login/logout. */
  @Get('users/:personId/push-tokens')
  async pushTokens(@Param('personId', ParseUUIDPipe) personId: string) {
    return { tokens: await this.deviceTokenRepo.findTokensForPerson(personId) };
  }
}
