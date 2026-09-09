// Library -- additive only. Reuses the existing, already-built Library
// module's own services/tables as-is (no new tables, no rebuild): catalog
// search (books/categories, public school-wide info, same as any LIBRARY/
// ADMIN read) and "my issues" (own borrowing history), the latter always
// forced to the caller's own resolved library_member id -- a client-supplied
// memberId is never trusted, matching the same pattern used everywhere else
// in this Faculty build.

import { Controller, Get, Param, Query } from '@nestjs/common';
import { BooksService } from '../library/books.service';
import { BookQueryDto } from '../library/dto/book-query.dto';
import { CategoryQueryDto } from '../library/dto/category-query.dto';
import { IssueQueryDto } from '../library/dto/issue-query.dto';
import { CategoriesService } from '../library/categories.service';
import { CirculationService } from '../library/circulation.service';
import { LibraryMemberRepository } from '../library/repositories/library-member.repository';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';

@Roles('FACULTY')
@Controller('faculty/library')
export class FacultyLibraryController {
  constructor(
    private readonly booksService: BooksService,
    private readonly categoriesService: CategoriesService,
    private readonly circulationService: CirculationService,
    private readonly memberRepo: LibraryMemberRepository,
  ) {}

  @Get('books')
  async listBooks(@Query() query: BookQueryDto) {
    return this.booksService.list(query);
  }

  @Get('books/:id')
  async getBook(@Param('id') id: string) {
    return { data: await this.booksService.get(id) };
  }

  @Get('categories')
  async listCategories(@Query() query: CategoryQueryDto) {
    return { data: await this.categoriesService.list(query) };
  }

  /** Own borrowing history only -- ignores any memberId the client might
   * (incorrectly) send and resolves it fresh from the caller's own personId
   * every time. No library_member row yet -> honestly empty, not an error. */
  @Get('my-issues')
  async myIssues(@Query() query: IssueQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    const member = await this.memberRepo.findByPersonId(actor.personId);
    if (!member) {
      return { data: [], meta: { page: query.page ?? 1, limit: query.limit ?? 50, total: 0 }, hasLibraryCard: false };
    }
    const result = await this.circulationService.list({ ...query, memberId: member.id });
    return { ...result, hasLibraryCard: true };
  }
}
