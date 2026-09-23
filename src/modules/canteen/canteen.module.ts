import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CanteenRateLimitGuard } from './canteen-rate-limit.guard';
import { CanteenController } from './canteen.controller';
import { CanteenService } from './canteen.service';
import { CanteenRepository } from './repositories/canteen.repository';

@Module({
  controllers: [CanteenController],
  providers: [
    CanteenService,
    CanteenRepository,
    UnitOfWork,
    AuditService,
    CanteenRateLimitGuard,
  ],
})
export class CanteenModule {}
