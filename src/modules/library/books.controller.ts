import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { BooksService } from './books.service';
import { BookQueryDto } from './dto/book-query.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';

@Controller('library/books')
@Roles('LIBRARY', 'ADMIN')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  async list(@Query() query: BookQueryDto) {
    return this.booksService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.booksService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async create(@Body() dto: CreateBookDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.booksService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('LIBRARY')
  async update(@Param('id') id: string, @Body() dto: UpdateBookDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.booksService.update(id, dto, actor.personId) };
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async withdraw(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.booksService.withdraw(id, actor.personId) };
  }
}
