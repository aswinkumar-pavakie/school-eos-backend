import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { TripsQueryDto } from './dto/trips-query.dto';
import { TripsService } from './trips.service';

@Roles('ADMIN', 'TRANSPORT_MANAGER')
@Controller('transport-ops/trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  async list(@Query() query: TripsQueryDto) {
    return this.tripsService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.tripsService.get(id) };
  }
}
