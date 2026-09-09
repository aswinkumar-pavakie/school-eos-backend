import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { BusTrackingService } from './bus-tracking.service';
import { FleetTrackingQueryDto } from './dto/fleet-tracking-query.dto';
import { TransportOpsQueryDto } from './dto/transport-ops-query.dto';

@Roles('ADMIN', 'TRANSPORT_MANAGER')
@Controller('transport-ops/bus-tracking')
export class BusTrackingController {
  constructor(private readonly busTrackingService: BusTrackingService) {}

  // Static sub-path, checked before Nest resolves the bare @Get() below --
  // the whole fleet's current tracking summary, for Live Tracking's bus
  // list/map and the Overview's live-bus tiles.
  @Get('fleet')
  async listFleet(@Query() query: FleetTrackingQueryDto) {
    return { data: await this.busTrackingService.listFleet(query.date) };
  }

  @Get()
  async get(@Query() query: TransportOpsQueryDto) {
    return {
      data: await this.busTrackingService.getTracking(
        query.vehicleId,
        query.date,
      ),
    };
  }
}
