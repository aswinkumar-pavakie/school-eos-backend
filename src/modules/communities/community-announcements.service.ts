import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { PostgresService } from '../../infrastructure/postgres/postgres.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { CommunitiesService } from './communities.service';
import { CommunityAnnouncementRepository } from './repositories/community-announcement.repository';

@Injectable()
export class CommunityAnnouncementsService {
  constructor(
    private readonly announcementRepo: CommunityAnnouncementRepository,
    private readonly communitiesService: CommunitiesService,
    private readonly auditService: AuditService,
    private readonly postgres: PostgresService,
  ) {}

  /** Same resolution every other Community module in this codebase
   * duplicates rather than imports cross-module (see
   * CommunityProposalsService's own copy for the full reasoning). */
  private async resolveAuthorizedCommunityId(
    personId: string,
  ): Promise<string> {
    const { rows } = await this.postgres.query<{ scope_id: string }>(
      `SELECT scope_id FROM role_assignment
       WHERE person_id = $1 AND role_code = 'COMMUNITY' AND scope_type = 'COMMUNITY' AND status = 'ACTIVE'
       LIMIT 1`,
      [personId],
    );
    if (!rows[0]?.scope_id) {
      throw new ForbiddenException(
        'This Community account is not assigned to a specific community.',
      );
    }
    return rows[0].scope_id;
  }

  /** ADMIN keeps its existing unrestricted authority over every community's
   * announcements. A COMMUNITY actor is newly allowed to write here too
   * (this feature), but only ever to its OWN community -- checked against
   * the caller's own role_assignment, never trusted from the path param.
   * Non-disclosing on mismatch (NotFoundException, not Forbidden), matching
   * every other Community write path's "wrong-community reads identically
   * to not-found" convention. */
  private async assertCanWriteCommunity(
    communityId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!actor.roles.includes('COMMUNITY')) return;
    const ownCommunityId = await this.resolveAuthorizedCommunityId(
      actor.personId,
    );
    if (ownCommunityId !== communityId) {
      throw new NotFoundException('Community announcement not found');
    }
  }

  async listByCommunity(communityId: string) {
    await this.communitiesService.get(communityId);
    return this.announcementRepo.findByCommunityId(communityId);
  }

  async create(
    communityId: string,
    dto: CreateAnnouncementDto,
    actor: AuthenticatedUser,
  ) {
    await this.communitiesService.get(communityId);
    await this.assertCanWriteCommunity(communityId, actor);
    const created = await this.announcementRepo.create({
      communityId,
      title: dto.title,
      body: dto.body,
      publishedBy: actor.personId,
      state: dto.state,
    });
    await this.auditService.record({
      actorPersonId: actor.personId,
      action: 'COMMUNITY_ANNOUNCEMENT_CREATED',
      objectType: 'community_announcement',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateAnnouncementDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.announcementRepo.findById(id);
    if (!existing)
      throw new NotFoundException('Community announcement not found');
    await this.assertCanWriteCommunity(existing.communityId, actor);
    const updated = await this.announcementRepo.update(id, dto);
    if (!updated)
      throw new NotFoundException('Community announcement not found');
    await this.auditService.record({
      actorPersonId: actor.personId,
      action: 'COMMUNITY_ANNOUNCEMENT_UPDATED',
      objectType: 'community_announcement',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
