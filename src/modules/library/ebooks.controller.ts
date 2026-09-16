import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateEbookDto } from './dto/create-ebook.dto';
import { EbookQueryDto } from './dto/ebook-query.dto';
import { UpdateEbookDto } from './dto/update-ebook.dto';
import { EbooksService } from './ebooks.service';

// Real digital-resource records -- own table (library_ebook). Each row is a
// real external link (resourceUrl); this app never stores or serves the
// resource's own content -- opening one just navigates to the official
// link, exactly how a real school library's own eResources list works.
// LIBRARY owns writes; ADMIN/FACULTY/PARENT get read-only access (a parent/
// student browsing what's available, a faculty member pointing a class at a
// resource) -- same posture as the physical catalog's own read-broadening.
@Controller('library/ebooks')
@Roles('LIBRARY', 'ADMIN', 'FACULTY', 'PARENT')
export class EbooksController {
  constructor(private readonly ebooksService: EbooksService) {}

  @Get()
  async list(@Query() query: EbookQueryDto) {
    return this.ebooksService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.ebooksService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async create(
    @Body() dto: CreateEbookDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.ebooksService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('LIBRARY')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEbookDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.ebooksService.update(id, dto, actor.personId) };
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async withdraw(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.ebooksService.withdraw(id, actor.personId) };
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async reactivate(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.ebooksService.reactivate(id, actor.personId) };
  }
}
