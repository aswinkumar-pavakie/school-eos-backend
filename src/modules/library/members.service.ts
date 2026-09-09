import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { SuspendMemberDto } from './dto/suspend-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import { LibraryGradeLookupRepository } from './repositories/library-grade-lookup.repository';
import { LibraryMemberRepository } from './repositories/library-member.repository';

@Injectable()
export class MembersService {
  constructor(
    private readonly memberRepo: LibraryMemberRepository,
    private readonly gradeLookupRepo: LibraryGradeLookupRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(query: MemberQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.memberRepo.findMany({
      search: query.search,
      status: query.status,
      memberType: query.memberType,
      gradeId: query.gradeId,
      sectionId: query.sectionId,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  listGrades() {
    return this.gradeLookupRepo.listGrades();
  }

  listSections(gradeId: string | undefined) {
    return this.gradeLookupRepo.listSections(gradeId);
  }

  async get(id: string) {
    const member = await this.memberRepo.findById(id);
    if (!member) throw new NotFoundException('Member not found');
    const [activeIssuesCount, pendingFinesAmountPaise] = await Promise.all([
      this.memberRepo.countActiveIssues(id),
      this.memberRepo.sumPendingFines(id),
    ]);
    return { ...member, activeIssuesCount, pendingFinesAmountPaise };
  }

  async eligible(search: string | undefined) {
    return this.memberRepo.findEligiblePeople(search);
  }

  async create(dto: CreateMemberDto, actorPersonId: string) {
    try {
      const created = await this.memberRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_MEMBER_CREATED',
        objectType: 'library_member',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('This person is already a library member.');
      if (isForeignKeyViolation(err)) throw new NotFoundException('personId does not refer to an existing person.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateMemberDto, actorPersonId: string) {
    const existing = await this.memberRepo.findById(id);
    if (!existing) throw new NotFoundException('Member not found');
    const updated = (await this.memberRepo.update(id, dto.maxBooksAllowed))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_MEMBER_UPDATED',
      objectType: 'library_member',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async suspend(id: string, dto: SuspendMemberDto, actorPersonId: string) {
    const existing = await this.memberRepo.findById(id);
    if (!existing) throw new NotFoundException('Member not found');
    if (existing.status === 'SUSPENDED') throw new ConflictException('This member is already suspended.');
    const updated = (await this.memberRepo.setStatus(id, 'SUSPENDED', dto.reason))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_MEMBER_SUSPENDED',
      objectType: 'library_member',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async reactivate(id: string, actorPersonId: string) {
    const existing = await this.memberRepo.findById(id);
    if (!existing) throw new NotFoundException('Member not found');
    if (existing.status === 'ACTIVE') throw new ConflictException('This member is already active.');
    const updated = (await this.memberRepo.setStatus(id, 'ACTIVE', null))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_MEMBER_REACTIVATED',
      objectType: 'library_member',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
