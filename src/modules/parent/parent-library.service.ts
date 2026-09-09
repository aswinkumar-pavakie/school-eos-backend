// Library -- additive only, reuses the existing Library module's own
// services/tables as-is (no new tables), same reuse pattern as
// faculty-library.controller.ts. The one real difference: a Parent's
// library_member row is resolved via the CHILD's own person_id (every
// student has a real person row, login or not), never the parent's.

import { ForbiddenException, Injectable } from '@nestjs/common';
import { BooksService } from '../library/books.service';
import { CategoriesService } from '../library/categories.service';
import { CirculationService } from '../library/circulation.service';
import { BookQueryDto } from '../library/dto/book-query.dto';
import { CategoryQueryDto } from '../library/dto/category-query.dto';
import { LibraryFineRepository } from '../library/repositories/library-fine.repository';
import { LibraryMemberRepository } from '../library/repositories/library-member.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentAcademicRepository } from './repositories/parent-academic.repository';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ParentLibraryService {
  constructor(
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly academicRepo: ParentAcademicRepository,
    private readonly memberRepo: LibraryMemberRepository,
    private readonly circulationService: CirculationService,
    private readonly fineRepo: LibraryFineRepository,
    private readonly booksService: BooksService,
    private readonly categoriesService: CategoriesService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link)
      throw new ForbiddenException(
        'You are not a registered guardian of this student.',
      );
  }

  async getSummary(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const childPersonId = await this.academicRepo.getPersonId(studentId);
    const member = childPersonId
      ? await this.memberRepo.findByPersonId(childPersonId)
      : null;
    if (!member) {
      return {
        hasLibraryCard: false,
        stats: { issuedCount: 0, dueSoonCount: 0, pendingFinePaise: '0' },
        borrowed: [],
        history: [],
      };
    }

    const { data: rows } = await this.circulationService.list({
      memberId: member.id,
      limit: 200,
      page: 1,
    });
    const borrowed = rows.filter(
      (r) => r.status === 'ISSUED' || r.status === 'OVERDUE',
    );
    const history = rows.filter(
      (r) => r.status === 'RETURNED' || r.status === 'LOST',
    );
    const soon = addDays(new Date().toISOString().slice(0, 10), 3);
    const dueSoonCount = borrowed.filter(
      (r) => r.status === 'ISSUED' && r.dueDate <= soon,
    ).length;

    const { rows: pendingFines } = await this.fineRepo.findMany({
      memberId: member.id,
      status: 'PENDING',
      limit: 200,
      offset: 0,
    });
    const pendingFinePaise = pendingFines
      .reduce((sum, f) => sum + BigInt(f.amountPaise), BigInt(0))
      .toString();

    return {
      hasLibraryCard: true,
      member: {
        id: member.id,
        maxBooksAllowed: member.maxBooksAllowed,
        status: member.status,
      },
      stats: { issuedCount: borrowed.length, dueSoonCount, pendingFinePaise },
      borrowed,
      history,
    };
  }

  async searchCatalog(
    personId: string,
    studentId: string,
    query: BookQueryDto,
  ) {
    await this.assertGuardian(personId, studentId);
    return this.booksService.list(query);
  }

  async getBook(personId: string, studentId: string, bookId: string) {
    await this.assertGuardian(personId, studentId);
    return this.booksService.get(bookId);
  }

  async listCategories(
    personId: string,
    studentId: string,
    query: CategoryQueryDto,
  ) {
    await this.assertGuardian(personId, studentId);
    return this.categoriesService.list(query);
  }
}
