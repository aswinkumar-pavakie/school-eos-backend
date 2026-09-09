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
import { StaffQueryDto } from '../people/dto/staff-query.dto';
import { StaffService } from '../people/staff.service';
import { StudentQueryDto } from '../people/dto/student-query.dto';
import { StudentsService } from '../people/students.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { PrincipalDirectorySearchDto } from './dto/principal-directory-search.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartStaffDirectConversationDto } from './dto/start-staff-direct-conversation.dto';
import { StartStudentConversationDto } from './dto/start-student-conversation.dto';
import { TranslateMessageDto } from './dto/translate-message.dto';
import { MessagingService } from './messaging.service';

// Shared endpoints (list/detail/messages/send/read/translate) are reachable by
// PRINCIPAL too -- once a conversation exists (STUDENT_CONTEXT or STAFF_DIRECT),
// Principal reuses exactly the same read/send/translate/read-state paths as
// Parent/Faculty. Object-level authorization for every one of these still
// happens inside MessagingService.getAuthorizedConversationOrThrow, never
// decided by @Roles alone.
@Controller('messages')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly staffService: StaffService,
    private readonly studentsService: StudentsService,
  ) {}

  @Roles('FACULTY', 'PARENT', 'PRINCIPAL')
  @Get('conversations')
  async listConversations(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.messagingService.listConversations(actor);
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT', 'PRINCIPAL')
  @Get('conversations/:id')
  async getConversation(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.messagingService.getConversation(actor, id);
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT', 'PRINCIPAL')
  @Get('conversations/:id/messages')
  async listMessages(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMessagesDto,
  ) {
    const { items, meta } = await this.messagingService.listMessages(
      actor,
      id,
      query.limit,
      query.before,
    );
    return { data: items, meta };
  }

  @Roles('FACULTY', 'PARENT', 'PRINCIPAL')
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
    const result = await this.messagingService.sendMessage(
      actor,
      id,
      dto.message,
      idempotencyKey,
    );
    return { data: result };
  }

  @Roles('FACULTY', 'PARENT', 'PRINCIPAL')
  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.messagingService.markRead(actor, id);
    return { data: { success: true } };
  }

  @Roles('FACULTY', 'PARENT', 'PRINCIPAL')
  @Post('conversations/:conversationId/messages/:messageId/translate')
  @HttpCode(HttpStatus.OK)
  async translateMessage(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: TranslateMessageDto,
  ) {
    const result = await this.messagingService.translateMessage(
      actor,
      conversationId,
      messageId,
      dto.targetLanguage,
    );
    return { data: result };
  }

  // ---- Principal: start a new conversation -----------------------------------

  @Roles('PRINCIPAL')
  @Post('principal/conversations/faculty')
  @HttpCode(HttpStatus.OK)
  async startFacultyConversation(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: StartStaffDirectConversationDto,
  ) {
    const result = await this.messagingService.startStaffDirectConversation(
      actor,
      dto.facultyPersonId,
    );
    return { data: result };
  }

  @Roles('PRINCIPAL')
  @Post('principal/conversations/student')
  @HttpCode(HttpStatus.OK)
  async startStudentConversation(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: StartStudentConversationDto,
  ) {
    const result = await this.messagingService.startStudentConversations(
      actor,
      dto.studentId,
    );
    return { data: result };
  }

  // ---- Faculty: start a conversation with the Principal ----------------------
  // No target-id/search needed -- PRINCIPAL is single-holder, resolved
  // server-side (see MessagingService.startPrincipalConversation).

  @Roles('FACULTY')
  @Post('faculty/conversations/principal')
  @HttpCode(HttpStatus.OK)
  async startPrincipalConversation(@CurrentActor() actor: AuthenticatedUser) {
    const result =
      await this.messagingService.startPrincipalConversation(actor);
    return { data: result };
  }

  // ---- Principal: search directories (messaging targets only) ---------------
  // Thin wrappers over the existing ADMIN-facing StaffService/StudentsService
  // (already exported by PeopleModule for exactly this kind of cross-module
  // picker reuse -- see StaffRepository/StaffService's own doc comment re: the
  // Events module's "monitoring teacher" picker). Principal gets read-only
  // search, never the ADMIN create/update/exit surface.

  @Roles('PRINCIPAL')
  @Get('principal/faculty/search')
  async searchFaculty(@Query() query: PrincipalDirectorySearchDto) {
    const facultyQuery = new StaffQueryDto();
    facultyQuery.search = query.search;
    facultyQuery.isTeaching = 'true';
    const result = await this.staffService.list(facultyQuery);
    return result;
  }

  @Roles('PRINCIPAL')
  @Get('principal/students/search')
  async searchStudents(@Query() query: PrincipalDirectorySearchDto) {
    const studentQuery = new StudentQueryDto();
    studentQuery.search = query.search;
    const result = await this.studentsService.list(studentQuery);
    return result;
  }
}
