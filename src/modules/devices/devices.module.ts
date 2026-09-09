// Devices (Admin's scope, per workflow.md): terminal registration (BUS/CANTEEN/GATE/
// LIBRARY) and the NFC id_card system (issue/block/reissue). `vehicle_id` (transport)
// and `vendor_id` (canteen, no app module yet) are accepted as opaque FKs, matching
// prior phases' cross-module reference convention. All tables already existed live in
// the DB -- pure application code.

import { Module } from '@nestjs/common';
import { IdCardsController } from './id-cards.controller';
import { IdCardsService } from './id-cards.service';
import { IdCardRepository } from './repositories/id-card.repository';
import { TerminalRepository } from './repositories/terminal.repository';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';

@Module({
  controllers: [TerminalsController, IdCardsController],
  providers: [
    TerminalsService,
    IdCardsService,
    TerminalRepository,
    IdCardRepository,
  ],
})
export class DevicesModule {}
