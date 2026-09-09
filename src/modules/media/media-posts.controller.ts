import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateMediaPostDto } from './dto/create-media-post.dto';
import { MediaPostQueryDto } from './dto/media-post-query.dto';
import { ReplyMediaPostCommentDto } from './dto/reply-media-post-comment.dto';
import { UpdateMediaPostDto } from './dto/update-media-post.dto';
import { mediaPostMulterOptions } from './media-storage.util';
import { MediaPostsService } from './media-posts.service';

@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/posts')
export class MediaPostsController {
  constructor(private readonly service: MediaPostsService) {}

  // Registered before ':id' below -- otherwise "comments" would be swallowed as
  // the :id param on the generic get/patch/delete routes.
  @Post('comments/:commentId/reply')
  @HttpCode(HttpStatus.OK)
  async replyToComment(
    @Param('commentId') commentId: string,
    @Body() dto: ReplyMediaPostCommentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.replyToComment(
        commentId,
        dto.reply,
        actor.personId,
      ),
    };
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @Param('commentId') commentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteComment(commentId, actor.personId);
    return { data: { deleted: true } };
  }

  // Widened for Faculty's own Home feed (published social media posts
  // alongside Announcements), and now Parent's own Home feed the same way --
  // everyone else's existing behavior is untouched. A non-MEDIA_ROOM/ADMIN/
  // PRINCIPAL caller (FACULTY or PARENT) always gets state forced to
  // PUBLISHED regardless of what they ask for: drafts/scheduled/cancelled
  // posts must never leak outside Media Room's own privileged callers.
  @Get()
  @Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL', 'FACULTY', 'PARENT')
  async list(
    @Query() query: MediaPostQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const privileged = actor.roles.some((r) =>
      ['MEDIA_ROOM', 'ADMIN', 'PRINCIPAL'].includes(r),
    );
    const filter = privileged ? query : { state: 'PUBLISHED' };
    return { data: await this.service.list(filter) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', undefined, mediaPostMulterOptions))
  async create(
    @Body() dto: CreateMediaPostDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    if (!files) throw new BadRequestException('files field is required.');
    return { data: await this.service.create(dto, files, actor.personId) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.service.get(id) };
  }

  @Get(':id/comments')
  async listComments(@Param('id') id: string) {
    return { data: await this.service.listComments(id) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaPostDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(id, dto, actor.personId) };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.cancel(id, actor.personId);
    return { data: { cancelled: true } };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.delete(id, actor.personId);
    return { data: { deleted: true } };
  }
}
