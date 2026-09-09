import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateLmsFolderDto } from './dto/create-lms-folder.dto';
import { CreateLmsLessonPlanDto } from './dto/create-lms-lesson-plan.dto';
import { CreateLmsTaskDto } from './dto/create-lms-task.dto';
import { UpdateLmsFolderDto } from './dto/update-lms-folder.dto';
import { UpdateLmsLessonPlanDto } from './dto/update-lms-lesson-plan.dto';
import { UpdateLmsTaskDto } from './dto/update-lms-task.dto';
import { FacultyLmsService } from './faculty-lms.service';
import { lmsFileMulterOptions } from './lms-storage.util';

@Roles('FACULTY')
@Controller('faculty/lms')
export class FacultyLmsController {
  constructor(private readonly service: FacultyLmsService) {}

  // ===== Subject folders (virtual) =====

  @Get('subjects')
  async listSubjects(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listSubjects(actor.personId) };
  }

  // ===== Materials sub-folders =====

  @Get('subjects/:subjectId/folders')
  async listFolders(
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listFolders(actor.personId, subjectId) };
  }

  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  async createFolder(
    @Body() dto: CreateLmsFolderDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createFolder(actor.personId, dto) };
  }

  @Get('folders/:id')
  async getFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getFolder(actor.personId, id) };
  }

  @Patch('folders/:id')
  async updateFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLmsFolderDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateFolder(actor.personId, id, dto) };
  }

  @Delete('folders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteFolder(actor.personId, id);
  }

  @Post('folders/:id/files')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', lmsFileMulterOptions))
  async uploadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    if (!file)
      throw new BadRequestException('A file is required (field name "file").');
    return { data: await this.service.uploadFile(actor.personId, id, file) };
  }

  @Get('files/:id/url')
  async getFileUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: { url: await this.service.getFileSignedUrl(actor.personId, id) },
    };
  }

  @Delete('files/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteFile(actor.personId, id);
  }

  // ===== Tasks =====

  @Get('tasks')
  async listTasks(
    @Query('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.listTasks(actor.personId, subjectOfferingId),
    };
  }

  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @Body() dto: CreateLmsTaskDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createTask(actor.personId, dto) };
  }

  @Patch('tasks/:id')
  async updateTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLmsTaskDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateTask(actor.personId, id, dto) };
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteTask(actor.personId, id);
  }

  // ===== Lesson Plans =====

  @Get('lesson-plans')
  async listLessonPlans(
    @Query('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.listLessonPlans(
        actor.personId,
        subjectOfferingId,
      ),
    };
  }

  @Post('lesson-plans')
  @HttpCode(HttpStatus.CREATED)
  async createLessonPlan(
    @Body() dto: CreateLmsLessonPlanDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createLessonPlan(actor.personId, dto) };
  }

  @Patch('lesson-plans/:id')
  async updateLessonPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLmsLessonPlanDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.updateLessonPlan(actor.personId, id, dto),
    };
  }

  @Delete('lesson-plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLessonPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteLessonPlan(actor.personId, id);
  }
}
