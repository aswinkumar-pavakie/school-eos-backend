import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentQueryDto } from './dto/parent-query.dto';
import { ParentsService } from './parents.service';

@Roles('ADMIN')
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get()
  async list(@Query() query: ParentQueryDto) {
    const result = await this.parentsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.parentsService.get(id) };
  }
}
