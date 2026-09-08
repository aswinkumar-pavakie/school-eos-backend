import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { BookQueryDto } from '../library/dto/book-query.dto';
import { CategoryQueryDto } from '../library/dto/category-query.dto';
import { ParentLibraryService } from './parent-library.service';

@Roles('PARENT')
@Controller('parent/students/:studentId/library')
export class ParentLibraryController {
  constructor(private readonly service: ParentLibraryService) {}

  @Get('summary')
  async getSummary(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getSummary(actor.personId, studentId) };
  }

  @Get('books')
  async searchCatalog(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: BookQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return this.service.searchCatalog(actor.personId, studentId, query);
  }

  @Get('books/:bookId')
  async getBook(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('bookId') bookId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getBook(actor.personId, studentId, bookId) };
  }

  @Get('categories')
  async listCategories(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: CategoryQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listCategories(actor.personId, studentId, query) };
  }
}
