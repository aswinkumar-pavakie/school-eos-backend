import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CommunityQueryDto } from './dto/community-query.dto';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { CommunityRepository } from './repositories/community.repository';

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly communityRepo: CommunityRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: CommunityQueryDto) {
    return this.communityRepo.findMany({
      academicYearId: query.academicYearId,
      state: query.state,
    });
  }

  async get(id: string) {
    const community = await this.communityRepo.findById(id);
    if (!community) throw new NotFoundException('Community not found');
    return community;
  }

  async create(dto: CreateCommunityDto, actorPersonId: string) {
    try {
      const created = await this.communityRepo.create({
        name: dto.name,
        communityCategory: dto.communityCategory,
        description: dto.description ?? null,
        inchargeStaffId: dto.inchargeStaffId ?? null,
        academicYearId: dto.academicYearId,
        maxMembers: dto.maxMembers ?? null,
        discussionEnabled: dto.discussionEnabled,
        moderationMode: dto.moderationMode,
        createdBy: actorPersonId,
      });
      await this.auditService.record({
        actorPersonId,
        action: 'COMMUNITY_CREATED',
        objectType: 'community',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A community with this name already exists for this academic year.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'academicYearId or inchargeStaffId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCommunityDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.communityRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Community not found');
      await this.auditService.record({
        actorPersonId,
        action: 'COMMUNITY_UPDATED',
        objectType: 'community',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A community with this name already exists for this academic year.',
        );
      }
      if (isForeignKeyViolation(err)) {
        throw new NotFoundException(
          'inchargeStaffId does not refer to an existing record.',
        );
      }
      throw err;
    }
  }

  /** One-way: nothing patches state back out of ARCHIVED. */
  async archive(id: string, actorPersonId: string) {
    const existing = await this.get(id);
    if (existing.state === 'ARCHIVED') {
      throw new BadRequestException('This community is already archived.');
    }
    const updated = await this.communityRepo.setState(id, 'ARCHIVED');
    if (!updated) throw new NotFoundException('Community not found');
    await this.auditService.record({
      actorPersonId,
      action: 'COMMUNITY_ARCHIVED',
      objectType: 'community',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
