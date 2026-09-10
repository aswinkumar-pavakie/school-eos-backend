import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CreateAiBotMessageDto } from './dto/create-ai-bot-message.dto';
import {
  AiBotConversationRepository,
  AiBotMessageRow,
} from './repositories/ai-bot-conversation.repository';

@Injectable()
export class AiBotService {
  constructor(
    private readonly conversationRepo: AiBotConversationRepository,
    private readonly audit: AuditService,
  ) {}

  async createConversation(actor: AuthenticatedUser) {
    // Primary role for this thread is whichever the bot itself would resolve
    // first (see school-eos-ai-bot's tool-registry.js) -- recorded for
    // reference only; every message still re-derives live authorization from
    // the actor's own token, never from this stored value.
    const roleCode = actor.roles[0] ?? 'UNKNOWN';
    const conversation = await this.conversationRepo.create(
      actor.personId,
      roleCode,
    );
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: roleCode,
      action: 'AI_BOT_CONVERSATION_STARTED',
      objectType: 'ai_bot_conversation',
      objectId: conversation.id,
      outcome: 'SUCCESS',
    });
    return conversation;
  }

  /** A conversation belongs to exactly the person who started it -- never
   * trusted from a client-supplied field, always the row's own person_id
   * checked against the live actor, same "never trust stored ownership"
   * convention the rest of this app follows. 404s (not 403) on mismatch. */
  private async requireOwnConversation(
    actor: AuthenticatedUser,
    conversationId: string,
  ) {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation || conversation.personId !== actor.personId) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async listMessages(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<AiBotMessageRow[]> {
    await this.requireOwnConversation(actor, conversationId);
    return this.conversationRepo.listMessages(conversationId);
  }

  async addMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    dto: CreateAiBotMessageDto,
  ): Promise<AiBotMessageRow> {
    await this.requireOwnConversation(actor, conversationId);
    const message = await this.conversationRepo.addMessage({
      conversationId,
      role: dto.role,
      content: dto.content,
      category: dto.category ?? null,
      toolCalls: dto.toolCalls ?? null,
    });

    // The audit trail this whole feature exists for: every question a parent
    // asked and every real tool call the bot made answering it, queryable
    // later the same way any other AuditService.record() call is.
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: actor.roles[0] ?? 'UNKNOWN',
      action: dto.role === 'user' ? 'AI_BOT_QUESTION_ASKED' : 'AI_BOT_ANSWER_GIVEN',
      objectType: 'ai_bot_message',
      objectId: message.id,
      outcome: 'SUCCESS',
      afterData: {
        conversationId,
        category: dto.category ?? null,
        toolCalls: dto.toolCalls ?? null,
      },
    });

    return message;
  }
}
