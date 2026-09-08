import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { LostDamagedQueryDto } from './dto/lost-damaged-query.dto';
import { LostDamagedService } from './lost-damaged.service';

@Controller('library/lost-damaged')
@Roles('LIBRARY', 'ADMIN')
export class LostDamagedController {
  constructor(private readonly lostDamagedService: LostDamagedService) {}

  @Get()
  async list(@Query() query: LostDamagedQueryDto) {
    return this.lostDamagedService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.lostDamagedService.get(id) };
  }
}
