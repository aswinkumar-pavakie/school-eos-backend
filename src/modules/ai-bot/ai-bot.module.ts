// Conversation persistence + audit trail for school-eos-ai-bot -- the bot
// itself holds no data of its own; it's a client of this API exactly like
// every other endpoint it calls for real school data. PostgresService and
// AuditService are both @Global() (PostgresModule/AuditModule) so neither
// needs listing here.
import { Module } from '@nestjs/common';
import { AiBotController } from './ai-bot.controller';
import { AiBotService } from './ai-bot.service';
import { AiBotConversationRepository } from './repositories/ai-bot-conversation.repository';

@Module({
  controllers: [AiBotController],
  providers: [AiBotService, AiBotConversationRepository],
})
export class AiBotModule {}
