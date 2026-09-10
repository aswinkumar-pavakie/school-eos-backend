// No @Roles() here deliberately -- the global AuthGuard/RolesGuard pair
// (app.module.ts) already means "no @Roles = any authenticated account", and
// that's exactly right for this module: PARENT today, TEACHER/PRINCIPAL once
// school-eos-ai-bot builds those tool sets, with zero controller changes
// needed when that happens.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { AiBotService } from './ai-bot.service';
import { CreateAiBotMessageDto } from './dto/create-ai-bot-message.dto';

@Controller('bot/conversations')
export class AiBotController {
  constructor(private readonly service: AiBotService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.createConversation(actor) };
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listMessages(actor, id) };
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAiBotMessageDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.addMessage(actor, id, dto) };
  }
}
