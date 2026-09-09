import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SubmitHomeworkDto } from './dto/submit-homework.dto';
import {
  HOMEWORK_FILE_MAX_COUNT,
  homeworkFileMulterOptions,
} from './homework-storage.util';
import { ParentHomeworkService } from './parent-homework.service';

@Roles('PARENT')
@Controller('parent/students/:studentId/homework')
export class ParentHomeworkController {
  constructor(private readonly service: ParentHomeworkService) {}

  @Get()
  async list(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.list(actor.personId, studentId) };
  }

  @Post(':homeworkId/submit')
  @UseInterceptors(
    FilesInterceptor(
      'files',
      HOMEWORK_FILE_MAX_COUNT,
      homeworkFileMulterOptions,
    ),
  )
  async submit(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('homeworkId', ParseUUIDPipe) homeworkId: string,
    @Body() dto: SubmitHomeworkDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.submit(
        actor.personId,
        studentId,
        homeworkId,
        dto,
        files ?? [],
      ),
    };
  }

  @Get(':homeworkId/file-url')
  async getFileUrl(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('homeworkId', ParseUUIDPipe) homeworkId: string,
    @Query('key') key: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    if (!key) throw new BadRequestException('key is required');
    return {
      data: {
        url: await this.service.getFileUrl(
          actor.personId,
          studentId,
          homeworkId,
          key,
        ),
      },
    };
  }
}
