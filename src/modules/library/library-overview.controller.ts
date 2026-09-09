import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { LibraryOverviewService } from './library-overview.service';

@Controller('library/overview')
@Roles('LIBRARY', 'ADMIN')
export class LibraryOverviewController {
  constructor(private readonly overviewService: LibraryOverviewService) {}

  @Get()
  async get() {
    return { data: await this.overviewService.get() };
  }
}
