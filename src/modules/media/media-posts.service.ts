// Social Media Publishing -- real DRAFT -> SCHEDULED -> PUBLISHED/CANCELLED
// lifecycle. Publishing this feed to the Parent/Faculty mobile app itself is a
// separate, later feature; this module is real and complete on its own regardless
// (see database/migrations/0006_media_room.sql's own header note).

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { CreateMediaPostDto } from './dto/create-media-post.dto';
import { UpdateMediaPostDto } from './dto/update-media-post.dto';
import { MEDIA_POSTS_BUCKET, mediaPostObjectKeyFor, mediaTypeFor } from './media-storage.util';
import { MediaPostCommentRepository } from './repositories/media-post-comment.repository';
import { MediaPostRepository, MediaPostRow } from './repositories/media-post.repository';

export interface MediaPostWithAssets extends MediaPostRow {
  assets: { id: string; objectKey: string; url: string; mediaType: string; sortOrder: number }[];
  commentCount: number;
  unansweredCommentCount: number;
}

@Injectable()
export class MediaPostsService {
  constructor(
    private readonly postRepo: MediaPostRepository,
    private readonly commentRepo: MediaPostCommentRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async attach(post: MediaPostRow): Promise<MediaPostWithAssets> {
    const [assets, counts] = await Promise.all([
      this.postRepo.listAssets(post.id),
      this.commentRepo.countByPost(),
    ]);
    const count = counts[post.id] ?? { total: 0, unanswered: 0 };
    return {
      ...post,
      assets: assets.map((a) => ({ ...a, url: this.storage.getPublicUrl(MEDIA_POSTS_BUCKET, a.objectKey) })),
      commentCount: count.total,
      unansweredCommentCount: count.unanswered,
    };
  }

  async list(filter: { state?: string }): Promise<MediaPostWithAssets[]> {
    const posts = await this.postRepo.list(filter);
    return Promise.all(posts.map((p) => this.attach(p)));
  }

  async get(id: string): Promise<MediaPostWithAssets> {
    const post = await this.postRepo.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    return this.attach(post);
  }

  async listComments(mediaPostId: string) {
    await this.get(mediaPostId);
    return this.commentRepo.listByPost(mediaPostId);
  }

  async create(dto: CreateMediaPostDto, files: Express.Multer.File[], actorPersonId: string): Promise<MediaPostWithAssets> {
    if (dto.saveAsDraft !== 'true' && files.length === 0) {
      throw new BadRequestException('At least one photo or video is required to publish or schedule a post.');
    }

    let state = 'PUBLISHED';
    let publishAt: string | null = null;
    if (dto.saveAsDraft === 'true') {
      state = 'DRAFT';
      publishAt = dto.publishAt ?? null;
    } else if (dto.publishAt) {
      if (new Date(dto.publishAt).getTime() <= Date.now()) {
        throw new ConflictException('publishAt must be a future date/time to schedule a post.');
      }
      state = 'SCHEDULED';
      publishAt = dto.publishAt;
    }

    const created = await this.postRepo.create({
      format: dto.format,
      category: dto.category,
      caption: dto.caption,
      firstComment: dto.firstComment,
      linkUrl: dto.linkUrl,
      pinToTop: dto.pinToTop === 'true',
      allowComments: dto.allowComments !== 'false',
      state,
      publishAt,
      createdBy: actorPersonId,
    });

    let sortOrder = 0;
    for (const file of files) {
      const objectKey = mediaPostObjectKeyFor(file);
      await this.storage.upload(MEDIA_POSTS_BUCKET, objectKey, file.buffer, file.mimetype);
      await this.postRepo.addAsset({ mediaPostId: created.id, objectKey, mediaType: mediaTypeFor(file), sortOrder });
      sortOrder += 1;
    }

    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_POST_CREATED',
      objectType: 'media_post',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: { ...created, assetCount: files.length },
    });

    return this.get(created.id);
  }

  async update(id: string, dto: UpdateMediaPostDto, actorPersonId: string) {
    const existing = await this.postRepo.findById(id);
    if (!existing) throw new NotFoundException('Post not found');
    await this.postRepo.update(id, {
      caption: dto.caption,
      firstComment: dto.firstComment,
      linkUrl: dto.linkUrl,
      pinToTop: dto.pinToTop !== undefined ? dto.pinToTop === 'true' : undefined,
      allowComments: dto.allowComments !== undefined ? dto.allowComments === 'true' : undefined,
    });
    const updated = await this.get(id);
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_POST_UPDATED',
      objectType: 'media_post',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async cancel(id: string, actorPersonId: string) {
    const existing = await this.postRepo.findById(id);
    if (!existing) throw new NotFoundException('Post not found');
    if (existing.state === 'PUBLISHED') {
      throw new ConflictException('A published post cannot be cancelled -- delete it instead if it must come down.');
    }
    await this.postRepo.setState(id, 'CANCELLED');
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_POST_CANCELLED',
      objectType: 'media_post',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }

  async delete(id: string, actorPersonId: string) {
    const existing = await this.postRepo.findById(id);
    if (!existing) throw new NotFoundException('Post not found');
    const assets = await this.postRepo.listAssets(id);
    await this.postRepo.delete(id);
    for (const asset of assets) {
      await this.storage.removeBestEffort(MEDIA_POSTS_BUCKET, asset.objectKey);
    }
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_POST_DELETED',
      objectType: 'media_post',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }

  async replyToComment(commentId: string, reply: string, actorPersonId: string) {
    const updated = await this.commentRepo.reply(commentId, { staffReply: reply, staffRepliedBy: actorPersonId });
    if (!updated) throw new NotFoundException('Comment not found');
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_POST_COMMENT_REPLIED',
      objectType: 'media_post_comment',
      objectId: commentId,
      outcome: 'SUCCESS',
      afterData: updated,
    });
    return updated;
  }

  async deleteComment(commentId: string, actorPersonId: string) {
    const existing = await this.commentRepo.findById(commentId);
    if (!existing) throw new NotFoundException('Comment not found');
    await this.commentRepo.delete(commentId);
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_POST_COMMENT_DELETED',
      objectType: 'media_post_comment',
      objectId: commentId,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }

  async countByState() {
    return this.postRepo.countByState();
  }
}
