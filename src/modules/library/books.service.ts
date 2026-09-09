import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { BookQueryDto } from './dto/book-query.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { isUniqueViolation } from './pg-error.util';
import { LibraryBookRepository } from './repositories/library-book.repository';

@Injectable()
export class BooksService {
  constructor(
    private readonly bookRepo: LibraryBookRepository,
    private readonly auditService: AuditService,
  ) {}

  async list(query: BookQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.bookRepo.findMany({
      search: query.search,
      categoryId: query.categoryId,
      author: query.author,
      publisher: query.publisher,
      status: query.status,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const book = await this.bookRepo.findById(id);
    if (!book) throw new NotFoundException('Book not found');
    const copiesSummary = await this.bookRepo.findCopiesSummary(id);
    return { ...book, copiesSummary };
  }

  async create(dto: CreateBookDto, actorPersonId: string) {
    try {
      const created = await this.bookRepo.create({ ...dto, createdBy: actorPersonId });
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_BOOK_CREATED',
        objectType: 'library_book',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A book with this ISBN already exists.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateBookDto, actorPersonId: string) {
    const existing = await this.bookRepo.findById(id);
    if (!existing) throw new NotFoundException('Book not found');
    try {
      const updated = (await this.bookRepo.update(id, dto))!;
      await this.auditService.record({
        actorPersonId,
        action: 'LIBRARY_BOOK_UPDATED',
        objectType: 'library_book',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A book with this ISBN already exists.');
      throw err;
    }
  }

  async withdraw(id: string, actorPersonId: string) {
    const existing = await this.bookRepo.findById(id);
    if (!existing) throw new NotFoundException('Book not found');
    if (existing.status === 'WITHDRAWN') throw new ConflictException('This book is already withdrawn.');
    const updated = (await this.bookRepo.setStatus(id, 'WITHDRAWN'))!;
    await this.auditService.record({
      actorPersonId,
      action: 'LIBRARY_BOOK_WITHDRAWN',
      objectType: 'library_book',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }
}
