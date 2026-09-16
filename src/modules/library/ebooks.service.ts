import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CreateEbookDto } from './dto/create-ebook.dto';
import { EbookQueryDto } from './dto/ebook-query.dto';
import { UpdateEbookDto } from './dto/update-ebook.dto';
import { LibraryEbookRepository } from './repositories/library-ebook.repository';

@Injectable()
export class EbooksService {
  constructor(
    private readonly ebookRepo: LibraryEbookRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(query: EbookQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.ebookRepo.findMany({
      search: query.search,
      categoryId: query.categoryId,
      status: query.status,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const ebook = await this.ebookRepo.findById(id);
    if (!ebook) throw new NotFoundException('eBook not found');
    return ebook;
  }

  async create(dto: CreateEbookDto, actorPersonId: string) {
    const created = await this.ebookRepo.create({
      title: dto.title,
      author: dto.author ?? null,
      publisher: dto.publisher ?? null,
      edition: dto.edition ?? null,
      categoryId: dto.categoryId ?? null,
      language: dto.language ?? null,
      description: dto.description ?? null,
      coverImageUrl: dto.coverImageUrl ?? null,
      resourceUrl: dto.resourceUrl,
      createdBy: actorPersonId,
    });
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_EBOOK_CREATED',
      objectType: 'library_ebook',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: created,
    });
    return created;
  }

  async update(id: string, dto: UpdateEbookDto, actorPersonId: string) {
    const existing = await this.ebookRepo.findById(id);
    if (!existing) throw new NotFoundException('eBook not found');
    const updated = await this.ebookRepo.update(id, dto);
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_EBOOK_UPDATED',
      objectType: 'library_ebook',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async withdraw(id: string, actorPersonId: string) {
    return this.setStatus(id, 'WITHDRAWN', actorPersonId);
  }

  async reactivate(id: string, actorPersonId: string) {
    return this.setStatus(id, 'ACTIVE', actorPersonId);
  }

  private async setStatus(id: string, status: string, actorPersonId: string) {
    const existing = await this.ebookRepo.findById(id);
    if (!existing) throw new NotFoundException('eBook not found');
    const updated = await this.ebookRepo.setStatus(id, status);
    await this.auditService.record({
      actorPersonId,
      action: status === 'ACTIVE' ? 'LIBRARY_EBOOK_REACTIVATED' : 'LIBRARY_EBOOK_WITHDRAWN',
      objectType: 'library_ebook',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
