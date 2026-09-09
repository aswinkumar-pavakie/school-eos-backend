// Transport Manager's operational read layer: Bus Tracking (real GPS telemetry,
// never fabricated), Boarding Monitor (real NFC/attendant boarding events +
// approved leave requests), Trips (real trip lifecycle rows), Boarding Events
// (the "NFC Attendance" screen's real data source), and Transport Alerts
// (read + acknowledge). Deliberately a sibling of the Admin-owned `transport`
// module, not a merge into it -- this module never creates/updates a vehicle,
// route, driver, or student allocation, and never starts/completes a trip; it
// only reads through TransportModule's own exported services (no duplicated
// queries) plus tables genuinely not covered by any existing endpoint
// (telemetry_event, trip, bus_boarding_event, student_trip_status,
// transport_alert), and the existing (previously untouched)
// student_leave_request table. No new database tables, no GPS/NFC ingestion,
// no trip lifecycle writes -- see query.md history and this module's own
// service files for the exact scope boundary.

import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { BoardingEventsController } from './boarding-events.controller';
import { BoardingEventsService } from './boarding-events.service';
import { BoardingMonitorController } from './boarding-monitor.controller';
import { BoardingMonitorService } from './boarding-monitor.service';
import { BusTrackingController } from './bus-tracking.controller';
import { BusTrackingService } from './bus-tracking.service';
import { BoardingEventsRepository } from './repositories/boarding-events.repository';
import { BoardingMonitorRepository } from './repositories/boarding-monitor.repository';
import { BusTrackingRepository } from './repositories/bus-tracking.repository';
import { TransportAlertRepository } from './repositories/transport-alert.repository';
import { TripsRepository } from './repositories/trips.repository';
import { TransportAlertsController } from './transport-alerts.controller';
import { TransportAlertsService } from './transport-alerts.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [TransportModule],
  controllers: [
    BusTrackingController,
    BoardingMonitorController,
    TripsController,
    BoardingEventsController,
    TransportAlertsController,
  ],
  providers: [
    BusTrackingService,
    BoardingMonitorService,
    TripsService,
    BoardingEventsService,
    TransportAlertsService,
    BusTrackingRepository,
    BoardingMonitorRepository,
    TripsRepository,
    BoardingEventsRepository,
    TransportAlertRepository,
  ],
})
export class TransportOpsModule {}
