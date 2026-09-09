import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto';
import { ParentDocumentsService } from './parent-documents.service';

@Roles('PARENT')
@Controller('parent/students/:studentId/documents')
export class ParentDocumentsController {
  constructor(private readonly service: ParentDocumentsService) {}

  @Get()
  async list(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId, studentId) };
  }

  @Post()
  async create(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: CreateDocumentRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(actor.personId, studentId, dto) };
  }

  @Get(':requestId/download-url')
  async getDownloadUrl(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: { url: await this.service.getDownloadUrl(actor.personId, studentId, requestId) } };
  }
}
