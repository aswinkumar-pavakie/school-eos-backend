import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { BoardingEventsService } from './boarding-events.service';
import { BoardingEventsQueryDto } from './dto/boarding-events-query.dto';

@Roles('ADMIN', 'TRANSPORT_MANAGER')
@Controller('transport-ops/boarding-events')
export class BoardingEventsController {
  constructor(private readonly boardingEventsService: BoardingEventsService) {}

  @Get()
  async list(@Query() query: BoardingEventsQueryDto) {
    return this.boardingEventsService.list(query);
  }
}
