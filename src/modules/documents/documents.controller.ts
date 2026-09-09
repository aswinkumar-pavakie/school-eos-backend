import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { documentMulterOptions } from './document-storage.util';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsService } from './documents.service';

@Roles('ADMIN')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async list(@Query() query: DocumentQueryDto) {
    return { data: await this.documentsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.documentsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateDocumentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.documentsService.create(dto, actor) };
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', documentMulterOptions))
  async upload(
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    if (!file)
      throw new BadRequestException('A file is required (field name "file").');
    return { data: await this.documentsService.upload(dto, file, actor) };
  }

  @Post(':id/purge')
  @HttpCode(HttpStatus.OK)
  async purge(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.documentsService.purge(id, actor.personId) };
  }
}
