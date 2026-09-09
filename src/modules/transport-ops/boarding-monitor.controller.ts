import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { BoardingMonitorService } from './boarding-monitor.service';
import { TransportOpsQueryDto } from './dto/transport-ops-query.dto';

@Roles('ADMIN', 'TRANSPORT_MANAGER')
@Controller('transport-ops/boarding-monitor')
export class BoardingMonitorController {
  constructor(
    private readonly boardingMonitorService: BoardingMonitorService,
  ) {}

  @Get()
  async get(@Query() query: TransportOpsQueryDto) {
    return {
      data: await this.boardingMonitorService.getBoardingMonitor(
        query.vehicleId,
        query.date,
      ),
    };
  }
}
