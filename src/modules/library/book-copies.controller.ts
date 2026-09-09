import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { BookCopiesService } from './book-copies.service';
import { CreateCopyDto } from './dto/create-copy.dto';
import { MarkDamagedDto } from './dto/mark-damaged.dto';
import { MarkLostDto } from './dto/mark-lost.dto';
import { UpdateCopyDto } from './dto/update-copy.dto';

@Controller('library/books/:bookId/copies')
@Roles('LIBRARY', 'ADMIN')
export class BookCopiesListController {
  constructor(private readonly copiesService: BookCopiesService) {}

  @Get()
  async list(@Param('bookId') bookId: string) {
    return { data: await this.copiesService.listForBook(bookId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async create(
    @Param('bookId') bookId: string,
    @Body() dto: CreateCopyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.copiesService.create(bookId, dto, actor.personId),
    };
  }
}

@Controller('library/copies')
@Roles('LIBRARY')
export class BookCopiesActionsController {
  constructor(private readonly copiesService: BookCopiesService) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCopyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.copiesService.update(id, dto, actor.personId) };
  }

  @Post(':id/mark-lost')
  @HttpCode(HttpStatus.OK)
  async markLost(
    @Param('id') id: string,
    @Body() dto: MarkLostDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.copiesService.markLost(
        id,
        actor.personId,
        dto.reason,
        dto.notes,
      ),
    };
  }

  @Post(':id/mark-damaged')
  @HttpCode(HttpStatus.OK)
  async markDamaged(
    @Param('id') id: string,
    @Body() dto: MarkDamagedDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.copiesService.markDamaged(
        id,
        actor.personId,
        dto.reason,
        dto.notes,
      ),
    };
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.copiesService.withdraw(id, actor.personId) };
  }

  @Post(':id/mark-under-repair')
  @HttpCode(HttpStatus.OK)
  async markUnderRepair(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.copiesService.markUnderRepair(id, actor.personId),
    };
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.copiesService.restore(id, actor.personId) };
  }
}
