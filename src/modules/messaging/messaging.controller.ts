// GET /messages/conversations, GET /messages/conversations/:id,
// GET .../:id/messages, POST .../:id/messages, PATCH .../:id/read,
// POST .../:id/messages/:messageId/translate — all FACULTY+PARENT, all scoped to
// the caller's own authorized conversations (see MessagingService for the
// authorization rules — role branching happens inside the service, not here,
// since Parent and Faculty share the same underlying conversation model).

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MESSAGING_ERRORS } from '../../common/errors/error-codes';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TranslateMessageDto } from './dto/translate-message.dto';
import { MessagingService } from './messaging.service';

@Controller('messages')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Roles('FACULTY', 'PARENT')
  @Get('conversations')
  async listConversations(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.messagingService.listConversations(actor);
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT')
  @Get('conversations/:id')
  async getConversation(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.messagingService.getConversation(actor, id);
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT')
  @Get('conversations/:id/messages')
  async listMessages(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMessagesDto,
  ) {
    const { items, meta } = await this.messagingService.listMessages(actor, id, query.limit, query.before);
    return { data: items, meta };
  }

  @Roles('FACULTY', 'PARENT')
  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(MESSAGING_ERRORS.IDEMPOTENCY_KEY_REQUIRED);
    }
    const result = await this.messagingService.sendMessage(actor, id, dto.message, idempotencyKey);
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT')
  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentActor() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.messagingService.markRead(actor, id);
    return { data: { success: true } };
  }

  @Roles('FACULTY', 'PARENT')
  @Post('conversations/:conversationId/messages/:messageId/translate')
  @HttpCode(HttpStatus.OK)
  async translateMessage(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: TranslateMessageDto,
  ) {
    const result = await this.messagingService.translateMessage(actor, conversationId, messageId, dto.targetLanguage);
    return { data: result };
  }
}
