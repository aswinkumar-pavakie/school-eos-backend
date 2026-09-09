import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateMediaTeamMemberDto } from './dto/create-media-team-member.dto';
import { UpdateMediaTeamMemberDto } from './dto/update-media-team-member.dto';
import { MediaTeamMemberRepository } from './repositories/media-team-member.repository';

@Injectable()
export class MediaTeamService {
  constructor(
    private readonly repo: MediaTeamMemberRepository,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.repo.listWithLoad();
  }

  async create(dto: CreateMediaTeamMemberDto, actorPersonId: string) {
    const created = await this.repo.create({
      ...dto,
      createdBy: actorPersonId,
    });
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_TEAM_MEMBER_CREATED',
      objectType: 'media_team_member',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateMediaTeamMemberDto,
    actorPersonId: string,
  ) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Media team member not found');
    const updated = await this.repo.update(id, dto);
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'MEDIA_ROOM',
      action: 'MEDIA_TEAM_MEMBER_UPDATED',
      objectType: 'media_team_member',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
