// Real auto-publish: the one thing that ever moves a media_post from SCHEDULED to
// PUBLISHED. Runs every minute -- publish-at precision to the minute is the real
// requirement here (a social post, not a payment), and FOR UPDATE SKIP LOCKED in
// the repository's own query means overlapping ticks can never double-publish the
// same row even if a slow tick is still finishing when the next one starts.

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { MediaPostRepository } from './repositories/media-post.repository';

@Injectable()
export class MediaPostsScheduler {
  private readonly logger = new Logger(MediaPostsScheduler.name);

  constructor(
    private readonly postRepo: MediaPostRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDuePosts(): Promise<void> {
    await this.unitOfWork.run(async (client) => {
      const due = await this.postRepo.findDueForPublish(client);
      for (const post of due) {
        await this.postRepo.setState(post.id, 'PUBLISHED', client, new Date());
        await this.audit.record(
          {
            actorPersonId: null,
            actorRoleCode: null,
            action: 'MEDIA_POST_AUTO_PUBLISHED',
            objectType: 'media_post',
            objectId: post.id,
            outcome: 'SUCCESS',
            afterData: { publishAt: post.publishAt },
          },
          client,
        );
        this.logger.log(`Auto-published media_post ${post.id} (was scheduled for ${post.publishAt?.toISOString()})`);
      }
    });
  }
}
